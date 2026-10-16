import { type HistoricalBar, type OptionType, type UnderlyingSymbol, TRADING_DAYS_PER_YEAR, getInstrument, roundToStrike } from '../types';
import { calculateBSPrice } from '../engine/blackScholes';
import { impliedVolForStrike } from '../engine/pricing';

/** NSE continuous session: 09:15 to 15:30 inclusive = 375 one-minute bars. */
export const SESSION_OPEN_MINUTES = 9 * 60 + 15;
export const SESSION_CLOSE_MINUTES = 15 * 60 + 30;
export const SESSION_MINUTES = SESSION_CLOSE_MINUTES - SESSION_OPEN_MINUTES;

export type MarketRegime = 'RANGE_BOUND' | 'TRENDING_UP' | 'TRENDING_DOWN' | 'GAMMA_EXPIRY';

export interface HistoricalSession {
  id: string;
  name: string;
  underlying: UnderlyingSymbol;
  date: string;
  description: string;
  bars: HistoricalBar[];
  /** Days remaining to expiry at the open of the session. */
  daysToExpiryAtOpen: number;
  /** IV level in percent for the session, before the strike smile is applied. */
  sessionIvPct: number;
  totalMinutes: number;
}

function formatClock(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Deterministic PRNG (mulberry32) so a given seed always yields the same tape.
 * Reproducibility is essential: the backtester's test suite asserts on results.
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Intraday volatility follows a U-shape: elevated at the open and the close,
 * quiet around midday. Scaling by this factor is what makes a same-day expiry
 * tape behave like a real one rather than a constant-vol random walk.
 *
 * @param fractionOfSession position through the session, 0 at the open and 1 at the close.
 * @returns multiplier on the baseline per-minute volatility.
 */
function intradayVolShape(fractionOfSession: number): number {
  const f = Math.min(Math.max(fractionOfSession, 0), 1);
  // 0 at midday, 1 at either bell.
  const distanceFromMidday = Math.abs(f - 0.5) / 0.5;
  // Trough of 0.55x at midday rising to ~2.2x at the open and close.
  return 0.55 + 1.65 * distanceFromMidday * distanceFromMidday;
}

/**
 * Generate a one-minute intraday tape for an index.
 *
 * Option premiums are deliberately NOT baked into the bars. They are derived
 * on demand from Black-Scholes against the bar's own spot and the time
 * remaining in the session, so premiums are always internally consistent with
 * spot and time instead of drifting away from any pricing model.
 */
export function generateDayBars(
  dateStr: string,
  basePrice: number,
  regime: MarketRegime,
  seed = 42
): HistoricalBar[] {
  const bars: HistoricalBar[] = [];
  const rng = createRng(seed);

  let price = basePrice;
  // Annualised index volatility expressed as a per-minute log-return sigma.
  const annualVol = regime === 'RANGE_BOUND' ? 0.09 : regime === 'GAMMA_EXPIRY' ? 0.26 : 0.15;
  const minutesPerYear = TRADING_DAYS_PER_YEAR * SESSION_MINUTES;
  const sigmaPerMinute = annualVol / Math.sqrt(minutesPerYear);

  // Drift per minute chosen so the session lands near the described outcome.
  const sessionDrift =
    regime === 'TRENDING_UP'
      ? (basePrice * 0.0072) / SESSION_MINUTES
      : regime === 'TRENDING_DOWN'
        ? -(basePrice * 0.0072) / SESSION_MINUTES
        : 0;

  for (let i = 0; i < SESSION_MINUTES; i += 1) {
    const fraction = i / SESSION_MINUTES;
    const open = price;

    let drift = sessionDrift;
    let volMultiplier = intradayVolShape(fraction);

    // The final 90 minutes of an expiry session see the gamma-driven expansion.
    if (regime === 'GAMMA_EXPIRY' && fraction > 0.76) {
      drift = (basePrice * 0.00042) * (fraction - 0.76);
      volMultiplier = 2.6;
    }

    const shock = gaussian(rng) * sigmaPerMinute * basePrice * volMultiplier;
    const close = open + drift + shock;

    const wick = Math.abs(gaussian(rng)) * sigmaPerMinute * basePrice * volMultiplier;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;

    bars.push({
      timestamp: `${dateStr}T${formatClock(SESSION_OPEN_MINUTES + i)}:00.000Z`,
      timeStr: formatClock(SESSION_OPEN_MINUTES + i),
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(0, low)),
      close: round2(close),
      volume: Math.floor(15000 + rng() * 45000),
    });

    price = close;
  }

  return bars;
}

/** Box-Muller transform, so shocks are normally distributed rather than uniform. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calendar days remaining to expiry at a given bar index. A same-day expiry
 * decays to zero at the 15:30 close, which is what drives 0-DTE theta.
 */
export function remainingDays(session: HistoricalSession, index: number): number {
  const minutesElapsed = Math.min(Math.max(index, 0), session.bars.length - 1);
  const minutesLeft = Math.max(0, session.totalMinutes - minutesElapsed);
  const fractionOfDayLeft = minutesLeft / (24 * 60);
  return session.daysToExpiryAtOpen > 0
    ? session.daysToExpiryAtOpen - minutesElapsed / (TRADING_DAYS_PER_YEAR * SESSION_MINUTES)
    : fractionOfDayLeft;
}

/**
 * Black-Scholes premium for a strike offset at a given bar, honouring the
 * session IV level and the strike smile. `strikeOffset` is 0 for ATM, +1 for
 * one strike above ATM, -1 for one below.
 */
export function optionPremiumAtBar(
  session: HistoricalSession,
  index: number,
  type: OptionType,
  strikeOffset = 0
): { strike: number; premium: number; ivPct: number } {
  const bar = session.bars[index] ?? session.bars[0]!;
  const instrument = getInstrument(session.underlying);
  const strike = roundToStrike(bar.close, session.underlying) + strikeOffset * instrument.strikeStep;

  // Session IV acts as the ATM level; the smile is layered on top of it.
  const smileIv = impliedVolForStrike(session.underlying, type, strike, bar.close);
  const ivPct = session.sessionIvPct + (smileIv - instrument.atmIv);

  const t = remainingDays(session, index) / TRADING_DAYS_PER_YEAR;
  const premium = calculateBSPrice({
    s: bar.close,
    k: strike,
    t,
    r: 0.068,
    sigma: ivPct / 100,
    type,
    q: instrument.dividendYield,
  });

  return { strike, premium: Math.max(0.05, round2(premium)), ivPct };
}

const SESSION_BLUEPRINT: {
  id: string;
  name: string;
  underlying: UnderlyingSymbol;
  date: string;
  description: string;
  basePrice: number;
  regime: MarketRegime;
  seed: number;
  daysToExpiry: number;
  sessionIvPct: number;
}[] = [
  {
    id: 'nifty-expiry-theta',
    name: 'NIFTY 50: Range-Bound Expiry (Theta Harvest)',
    underlying: 'NIFTY',
    date: '2024-10-10',
    description:
      'Low-volatility sideways session, standard 9:20 straddles decay peacefully without stop-loss triggers.',
    basePrice: 25000,
    regime: 'RANGE_BOUND',
    seed: 101,
    daysToExpiry: 0,
    sessionIvPct: 12.5,
  },
  {
    id: 'nifty-trend-day',
    name: 'NIFTY 50: Trend Day (Morning Breakout)',
    underlying: 'NIFTY',
    date: '2024-10-14',
    description:
      'Strong directional morning rally, triggering call stop-losses and testing trailing stop logic.',
    basePrice: 25150,
    regime: 'TRENDING_UP',
    seed: 202,
    daysToExpiry: 0,
    sessionIvPct: 16,
  },
  {
    id: 'nifty-gamma-blast',
    name: 'NIFTY 50: 0-DTE Gamma Blast (2:00 PM Reversal)',
    underlying: 'NIFTY',
    date: '2024-10-17',
    description:
      'Calm morning followed by an explosive swing in the final 90 minutes. High prop risk test.',
    basePrice: 24900,
    regime: 'GAMMA_EXPIRY',
    seed: 303,
    daysToExpiry: 0,
    sessionIvPct: 24,
  },
  {
    id: 'banknifty-expiry',
    name: 'BANK NIFTY: High-Beta Expiry Session',
    underlying: 'BANKNIFTY',
    date: '2024-10-16',
    description:
      'Volatile high-beta intra-day range testing high drawdown and multi-leg risk management.',
    basePrice: 51500,
    regime: 'GAMMA_EXPIRY',
    seed: 404,
    daysToExpiry: 0,
    sessionIvPct: 22,
  },
];

export const PRESET_HISTORICAL_SESSIONS: HistoricalSession[] = SESSION_BLUEPRINT.map((bp) => ({
  id: bp.id,
  name: bp.name,
  underlying: bp.underlying,
  date: bp.date,
  description: bp.description,
  daysToExpiryAtOpen: bp.daysToExpiry,
  sessionIvPct: bp.sessionIvPct,
  totalMinutes: SESSION_MINUTES,
  bars: generateDayBars(bp.date, bp.basePrice, bp.regime, bp.seed),
}));

export function getSession(sessionId: string): HistoricalSession | undefined {
  return PRESET_HISTORICAL_SESSIONS.find((s) => s.id === sessionId);
}

/** Closes the final minute of the session. */
export function lastBarIndex(session: HistoricalSession): number {
  return session.bars.length - 1;
}
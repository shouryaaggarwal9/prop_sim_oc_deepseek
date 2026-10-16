import {
  type Greeks,
  type OptionLeg,
  type PayoffPoint,
  type StrategyPayoffSummary,
  RISK_FREE_RATE,
  TRADING_DAYS_PER_YEAR,
  getInstrument,
} from '../types';
import { calculateBSPrice, calculateGreeks, normalCdf } from './blackScholes';

export interface PayoffCalculationOptions {
  legs: OptionLeg[];
  spotPrice: number;
  daysToExpiry: number;
  /** Days remaining on the forward (target-date) curve. Defaults to `daysToExpiry`. */
  targetDaysRemaining?: number;
  /** Shift applied to each leg's implied volatility, in percentage points. */
  targetIvShiftPct?: number;
  /** Half-width of the scanned spot range as a fraction, e.g. 0.08 for +/-8%. */
  priceRangePct?: number;
  r?: number;
  /** Number of grid points across the scanned range. */
  gridPoints?: number;
}

const EMPTY_PAYOFF = (): StrategyPayoffSummary => ({
  payoffPoints: [],
  maxProfit: 0,
  maxLoss: 0,
  riskRewardRatio: 'n/a',
  breakevens: [],
  probabilityOfProfit: 0,
  netGreeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
  totalCost: 0,
  totalMarginEstimate: 0,
});

/**
 * Full strategy analytics: expiry and forward payoff curves, breakevens,
 * probability of profit, net greeks, net cost and a margin estimate.
 */
export function calculateStrategyPayoff({
  legs,
  spotPrice,
  daysToExpiry,
  targetDaysRemaining,
  targetIvShiftPct = 0,
  priceRangePct = 0.08,
  r = RISK_FREE_RATE,
  gridPoints = 121,
}: PayoffCalculationOptions): StrategyPayoffSummary {
  if (legs.length === 0 || !Number.isFinite(spotPrice) || spotPrice <= 0) {
    return EMPTY_PAYOFF();
  }

  const targetDays = targetDaysRemaining ?? daysToExpiry;
  const targetT = Math.max(0.0001, targetDays) / TRADING_DAYS_PER_YEAR;

  const minPrice = Math.max(0, Math.floor((spotPrice * (1 - priceRangePct)) / 10) * 10);
  const maxPrice = Math.ceil((spotPrice * (1 + priceRangePct)) / 10) * 10;
  const steps = Math.max(2, Math.floor(gridPoints));
  const step = (maxPrice - minPrice) / (steps - 1);

  const payoffPoints: PayoffPoint[] = [];

  for (let i = 0; i < steps; i += 1) {
    const p = round2(minPrice + i * step);
    let expiryPnl = 0;
    let targetPnl = 0;

    for (const leg of legs) {
      const multiplier = leg.lots * leg.lotSize;
      const sign = leg.action === 'BUY' ? 1 : -1;

      const intrinsic = leg.type === 'CE' ? Math.max(0, p - leg.strike) : Math.max(0, leg.strike - p);
      expiryPnl += sign * (intrinsic - leg.entryPrice) * multiplier;

      const iv = Math.max(0.5, leg.iv + targetIvShiftPct) / 100;
      const theoretical = calculateBSPrice({
        s: p,
        k: leg.strike,
        t: targetT,
        r,
        sigma: iv,
        type: leg.type,
        q: getInstrument(leg.underlying).dividendYield,
      });
      targetPnl += sign * (theoretical - leg.entryPrice) * multiplier;
    }

    payoffPoints.push({
      underlyingPrice: p,
      expiryPayoff: Math.round(expiryPnl),
      targetPayoff: Math.round(targetPnl),
    });
  }

  const breakevens = findBreakevens(payoffPoints);

  const netGreeks = aggregateGreeks(legs, spotPrice, daysToExpiry, r);
  const totalCost = legs.reduce(
    (acc, leg) => acc + (leg.action === 'BUY' ? 1 : -1) * leg.entryPrice * leg.lots * leg.lotSize,
    0
  );

  const probabilityOfProfit = estimateProbabilityOfProfit({
    legs,
    spotPrice,
    daysToExpiry,
    breakevens,
    payoffPoints,
    r,
  });

  const { maxProfit, maxLoss } = deriveExtremes(legs);

  return {
    payoffPoints,
    maxProfit,
    maxLoss,
    riskRewardRatio: riskReward(maxProfit, maxLoss),
    breakevens,
    probabilityOfProfit,
    netGreeks,
    totalCost: Math.round(totalCost),
    totalMarginEstimate: estimateMargin(legs, totalCost),
  };
}

/**
 * Zero crossings of the expiry curve, refined by linear interpolation.
 * A curve that sits exactly on zero across a whole segment yields one breakeven.
 */
function findBreakevens(points: PayoffPoint[]): number[] {
  const out: number[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;

    if (prev.expiryPayoff === 0) {
      out.push(prev.underlyingPrice);
      continue;
    }

    // Both directions matter: a short strangle crosses up through its lower
    // breakeven and back down through its upper one.
    const crossedZero =
      (prev.expiryPayoff < 0 && curr.expiryPayoff >= 0) ||
      (prev.expiryPayoff > 0 && curr.expiryPayoff <= 0);

    if (crossedZero) {
      const slope =
        (curr.expiryPayoff - prev.expiryPayoff) /
        (curr.underlyingPrice - prev.underlyingPrice);
      if (slope !== 0) {
        out.push(Math.round(prev.underlyingPrice - prev.expiryPayoff / slope));
      }
    }
  }

  const last = points[points.length - 1];
  if (last && last.expiryPayoff === 0) out.push(last.underlyingPrice);

  // De-duplicate crossings that land on the same strike.
  return [...new Set(out)].sort((a, b) => a - b).slice(0, 4);
}

/**
 * Probability of finishing in profit at expiry, from a lognormal terminal
 * distribution of the underlying.
 *
 * Assumes every leg shares one volatility (the mean leg IV), which is a
 * deliberate simplification for multi-leg structures. Returns `null` when the
 * breakeven structure cannot be evaluated, rather than guessing a default.
 */
function estimateProbabilityOfProfit({
  legs,
  spotPrice,
  daysToExpiry,
  breakevens,
  payoffPoints,
  r,
}: {
  legs: OptionLeg[];
  spotPrice: number;
  daysToExpiry: number;
  breakevens: number[];
  payoffPoints: PayoffPoint[];
  r: number;
}): number {
  if (breakevens.length === 0 || daysToExpiry <= 0) return 50;

  const avgIv = Math.max(
    0.01,
    legs.reduce((acc, l) => acc + l.iv, 0) / legs.length / 100
  );
  const q = getInstrument(legs[0]!.underlying).dividendYield;
  const t = Math.max(1 / TRADING_DAYS_PER_YEAR, daysToExpiry / TRADING_DAYS_PER_YEAR);
  const sigmaSqrtT = avgIv * Math.sqrt(t);

  /** P(S_T > K) under a risk-neutral lognormal. */
  const probAbove = (k: number): number => {
    if (k <= 0) return 1;
    const d2 = (Math.log(spotPrice / k) + (r - q - 0.5 * avgIv * avgIv) * t) / sigmaSqrtT;
    return normalCdf(d2);
  };

  let pop: number;
  if (breakevens.length >= 2) {
    const lower = breakevens[0]!;
    const upper = breakevens[breakevens.length - 1]!;
    // Winning region is bounded when the two outermost breakevens bracket the profit zone.
    pop = Math.max(0, probAbove(lower) - probAbove(upper));
  } else {
    const be = breakevens[0]!;
    pop = probAbove(be);
  }

  // If the curve is profitable in the middle of the scanned range the winning
  // region is the interior, not the upper tail.
  const mid = payoffPoints[Math.floor(payoffPoints.length / 2)]!;
  const midIsProfit = mid.expiryPayoff > 0;
  if (breakevens.length >= 2 && midIsProfit) {
    pop = 1 - pop;
  } else if (breakevens.length === 1 && !midIsProfit) {
    pop = 1 - pop;
  }

  return Number((Math.min(99.9, Math.max(0.1, pop * 100))).toFixed(1));
}

function aggregateGreeks(
  legs: OptionLeg[],
  spotPrice: number,
  daysToExpiry: number,
  r: number
): Greeks {
  const total: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  const t = Math.max(0.0001, daysToExpiry) / TRADING_DAYS_PER_YEAR;

  for (const leg of legs) {
    const multiplier = leg.lots * leg.lotSize;
    const sign = leg.action === 'BUY' ? 1 : -1;
    const legGreeks = calculateGreeks({
      s: spotPrice,
      k: leg.strike,
      t,
      r,
      sigma: Math.max(0.01, leg.iv) / 100,
      type: leg.type,
      q: getInstrument(leg.underlying).dividendYield,
    });

    total.delta += sign * legGreeks.delta * multiplier;
    total.gamma += sign * legGreeks.gamma * multiplier;
    total.theta += sign * legGreeks.theta * multiplier;
    total.vega += sign * legGreeks.vega * multiplier;
    total.rho += sign * legGreeks.rho * multiplier;
  }

  return {
    delta: Number(total.delta.toFixed(3)),
    gamma: Number(total.gamma.toFixed(5)),
    theta: Math.round(total.theta),
    vega: Math.round(total.vega),
    rho: Math.round(total.rho),
  };
}

/**
 * Net call exposure, in units of premium.
 *
 * As spot rises without bound a call's value tracks spot while a put's decays
 * to zero. The payoff therefore diverges only according to the signed net call
 * position, which is what decides whether a side of the structure is
 * uncapped. Put exposure alone never creates unbounded risk, because spot
 * cannot fall below zero and every put is worth at most its strike.
 */
function netCallExposure(legs: OptionLeg[]): number {
  return legs
    .filter((leg) => leg.type === 'CE')
    .reduce((acc, leg) => acc + (leg.action === 'BUY' ? 1 : -1) * leg.lots * leg.lotSize, 0);
}

/** Expiry P&L of the whole structure at a single underlying price. */
export function expiryPnlAt(legs: OptionLeg[], spot: number): number {
  return legs.reduce((acc, leg) => {
    const sign = leg.action === 'BUY' ? 1 : -1;
    const intrinsic = leg.type === 'CE' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
    return acc + sign * (intrinsic - leg.entryPrice) * leg.lots * leg.lotSize;
  }, 0);
}

/**
 * Exact bounded extremes of the expiry payoff.
 *
 * The payoff is piecewise linear with kinks only at the leg strikes, so over a
 * bounded structure the global maximum and minimum are attained at a critical
 * point: spot at zero, at a leg strike, or beyond the highest strike. Sampling
 * the chart grid instead would clip the true worst case whenever the structure
 * is not flat across the displayed range.
 */
function structuralExtremes(legs: OptionLeg[]): { min: number; max: number } {
  if (legs.length === 0) return { min: 0, max: 0 };

  const strikes = legs.map((leg) => leg.strike);
  const highestStrike = Math.max(...strikes);

  // Enough headroom above the top strike to capture the far-right plateau.
  const rightTail = highestStrike + strikes.reduce((acc, k) => acc + k, 0) * 0.05 + 1;

  const criticalPoints = new Set<number>([0, rightTail, ...strikes]);
  const values = [...criticalPoints].map((p) => expiryPnlAt(legs, p));

  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Resolve max profit and max loss.
 *
 * A net long call position is unbounded above and a net short call position
 * unbounded below. Everything else is bounded, and the bound is taken from the
 * structural critical points so it is never clipped by the displayed price
 * range. A structure that can never lose never reports a phantom loss.
 */
function deriveExtremes(
  legs: OptionLeg[]
): { maxProfit: number | 'UNLIMITED'; maxLoss: number | 'UNLIMITED' } {
  const netCalls = netCallExposure(legs);
  const { min, max } = structuralExtremes(legs);

  return {
    maxProfit: netCalls > 0 ? 'UNLIMITED' : Math.max(0, Math.round(max)),
    maxLoss: netCalls < 0 ? 'UNLIMITED' : Math.max(0, Math.round(-min)),
  };
}

function riskReward(maxProfit: number | 'UNLIMITED', maxLoss: number | 'UNLIMITED'): string {
  if (typeof maxProfit !== 'number' || typeof maxLoss !== 'number') {
    if (maxProfit === 'UNLIMITED' && maxLoss === 'UNLIMITED') return 'n/a';
    return '1 : ∞';
  }
  if (maxLoss <= 0) return maxProfit > 0 ? '∞ : 1' : 'n/a';
  return `1 : ${(maxProfit / maxLoss).toFixed(2)}`;
}

/**
 * Coarse SPAN-plus-exposure margin proxy. Naked short options are the most
 * expensive; fully hedged wings materially reduce it.
 */
const NAKED_SHORT_MARGIN_PER_LOT = 115000;
const HEDGED_MARGIN_PER_LOT = 45000;

function estimateMargin(legs: OptionLeg[], totalCost: number): number {
  let shortLots = 0;
  let longLots = 0;

  for (const leg of legs) {
    if (leg.action === 'SELL') shortLots += leg.lots;
    else longLots += leg.lots;
  }

  if (shortLots === 0) return Math.max(0, Math.round(totalCost));

  const hedged = Math.min(shortLots, longLots);
  const naked = Math.max(0, shortLots - longLots);
  return Math.round(hedged * HEDGED_MARGIN_PER_LOT + naked * NAKED_SHORT_MARGIN_PER_LOT);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
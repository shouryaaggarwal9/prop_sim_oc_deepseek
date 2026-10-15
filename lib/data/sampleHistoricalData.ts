import { HistoricalBar } from '../types';

/**
 * Generates synthetic realistic 1-minute intraday bars for Nifty/Bank Nifty
 * based on standard Indian market parameters (09:15 to 15:30 = 375 bars per day).
 */
export function generateDayBars(
  dateStr: string,
  basePrice: number,
  trendType: 'RANGE_BOUND' | 'TRENDING_UP' | 'TRENDING_DOWN' | 'GAMMA_EXPIRY',
  seed: number = 42
): HistoricalBar[] {
  const bars: HistoricalBar[] = [];
  let currentPrice = basePrice;
  let currentCe = Math.round(basePrice * 0.008); // ATM Call premium ~180-200
  let currentPe = Math.round(basePrice * 0.008); // ATM Put premium ~180-200

  let pseudoRand = seed;
  const rand = () => {
    pseudoRand = (pseudoRand * 9301 + 49297) % 233280;
    return pseudoRand / 233280;
  };

  let hour = 9;
  let minute = 15;

  for (let i = 0; i < 375; i++) {
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const timestamp = `${dateStr}T${timeStr}:00.000Z`;

    // Drift & Volatility model
    let drift = 0;
    let vol = basePrice * 0.0004; // standard 1-min index vol

    if (trendType === 'TRENDING_UP') {
      drift = (basePrice * 0.00003);
    } else if (trendType === 'TRENDING_DOWN') {
      drift = -(basePrice * 0.00003);
    } else if (trendType === 'GAMMA_EXPIRY' && i > 300) {
      // 2:15 PM onwards sharp move
      drift = (basePrice * 0.00015);
      vol = basePrice * 0.0008;
    }

    const shock = (rand() - 0.49) * 2 * vol + drift;
    const open = Math.round(currentPrice * 100) / 100;
    const close = Math.round((currentPrice + shock) * 100) / 100;
    const high = Math.round((Math.max(open, close) + rand() * vol * 0.5) * 100) / 100;
    const low = Math.round((Math.min(open, close) - rand() * vol * 0.5) * 100) / 100;
    const volume = Math.floor(15000 + rand() * 45000);

    currentPrice = close;

    // Simulate decay & delta impact on ATM CE / PE
    const priceChange = close - open;
    const thetaDecayPerMinute = 0.18; // steady intraday theta decay
    currentCe = Math.max(1, currentCe + priceChange * 0.5 - thetaDecayPerMinute + (rand() - 0.5) * 0.5);
    currentPe = Math.max(1, currentPe - priceChange * 0.5 - thetaDecayPerMinute + (rand() - 0.5) * 0.5);

    bars.push({
      timestamp,
      timeStr,
      open,
      high,
      low,
      close,
      volume,
      ceLtp: Number(currentCe.toFixed(2)),
      peLtp: Number(currentPe.toFixed(2)),
    });

    minute++;
    if (minute === 60) {
      minute = 0;
      hour++;
    }
  }

  return bars;
}

export const PRESET_HISTORICAL_SESSIONS: {
  id: string;
  name: string;
  underlying: 'NIFTY' | 'BANKNIFTY';
  date: string;
  description: string;
  bars: HistoricalBar[];
}[] = [
  {
    id: 'nifty-expiry-theta',
    name: 'NIFTY 50: Range-Bound Expiry (Theta Harvest)',
    underlying: 'NIFTY',
    date: '2024-10-10',
    description: 'Low-volatility sideways session, standard 9:20 straddles decay peacefully without stop-loss triggers.',
    bars: generateDayBars('2024-10-10', 25000, 'RANGE_BOUND', 101),
  },
  {
    id: 'nifty-trend-day',
    name: 'NIFTY 50: Trend Day (Morning Breakout)',
    underlying: 'NIFTY',
    date: '2024-10-14',
    description: 'Strong directional morning rally (+180 pts), triggering Call stop-losses and testing trailing SL logic.',
    bars: generateDayBars('2024-10-14', 25150, 'TRENDING_UP', 202),
  },
  {
    id: 'nifty-gamma-blast',
    name: 'NIFTY 50: 0-DTE Gamma Blast (2:00 PM Reversal)',
    underlying: 'NIFTY',
    date: '2024-10-17',
    description: 'Calm morning followed by explosive 150-point swing in the final 90 minutes. High prop risk test.',
    bars: generateDayBars('2024-10-17', 24900, 'GAMMA_EXPIRY', 303),
  },
  {
    id: 'banknifty-expiry',
    name: 'BANK NIFTY: High-Beta Expiry Session',
    underlying: 'BANKNIFTY',
    date: '2024-10-16',
    description: 'Volatile 450-point intra-day range testing high-drawdown and multi-leg risk management.',
    bars: generateDayBars('2024-10-16', 51500, 'GAMMA_EXPIRY', 404),
  },
];

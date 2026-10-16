import { describe, expect, it } from 'vitest';
import { computeSharpe, parseClock, runBacktest } from '@/lib/engine/backtester';
import type { BacktestRule, BacktestTradeLog } from '@/lib/types';

function straddleRule(overrides: Partial<BacktestRule> = {}): BacktestRule {
  return {
    strategyName: '9:20 Short Straddle',
    underlying: 'NIFTY',
    entryTime: '09:20',
    exitTime: '15:15',
    legs: [
      { type: 'CE', action: 'SELL', strikeOffset: 0, stopLossPct: 25 },
      { type: 'PE', action: 'SELL', strikeOffset: 0, stopLossPct: 25 },
    ],
    slippagePct: 0.5,
    ...overrides,
  };
}

describe('parseClock', () => {
  it('parses valid times', () => {
    expect(parseClock('09:20')).toBe(560);
    expect(parseClock('15:30')).toBe(930);
    expect(parseClock('9:05')).toBe(545);
  });

  it('rejects malformed times instead of silently matching nothing', () => {
    for (const bad of ['', 'abc', '99:99', '09', '09:20:30', '25:00', '09:99', '-1:00']) {
      expect(parseClock(bad)).toBeNull();
    }
  });
});

describe('runBacktest — validation', () => {
  it('reports a warning and takes no trades for an invalid entry time', () => {
    const result = runBacktest(straddleRule({ entryTime: '99:99' }));
    expect(result.tradeLogs).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/entry time/i);
    expect(result.summary.totalTrades).toBe(0);
  });

  it('warns when the exit time precedes the entry time', () => {
    const result = runBacktest(straddleRule({ entryTime: '14:00', exitTime: '10:00' }));
    expect(result.tradeLogs).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/later than/i);
  });

  it('warns when no sessions match the underlying', () => {
    const result = runBacktest(straddleRule({ underlying: 'SENSEX' }));
    expect(result.tradeLogs).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/no historical sessions/i);
  });

  it('excludes slippage and exit slips so gross P&L reflects the fill assumptions', () => {
    const result = runBacktest(straddleRule());
    for (const trade of result.tradeLogs) {
      expect(trade.exitPrice).not.toBe(trade.entryPrice);
    }
  });
});

describe('runBacktest — strike offsets', () => {
  it('prices an out-of-the-money leg cheaper than the ATM leg', () => {
    const atm = runBacktest(straddleRule());
    const otm = runBacktest(
      straddleRule({
        strategyName: '9:20 Short Strangle',
        legs: [
          { type: 'CE', action: 'SELL', strikeOffset: 2, stopLossPct: 25 },
          { type: 'PE', action: 'SELL', strikeOffset: -2, stopLossPct: 25 },
        ],
      })
    );

    const atmCe = atm.tradeLogs.find((t) => t.instrument.includes('CE'))!;
    const otmCe = otm.tradeLogs.find((t) => t.instrument.includes('CE'))!;

    // The whole point of the offset: a genuinely different, cheaper contract.
    expect(otmCe.entryPrice).toBeLessThan(atmCe.entryPrice);
    expect(otmCe.instrument).not.toBe(atmCe.instrument);
    expect(otmCe.instrument).toMatch(/OTM/);
  });

  it('produces different results for ATM and OTM presets', () => {
    const atm = runBacktest(straddleRule());
    const otm = runBacktest(
      straddleRule({
        legs: [
          { type: 'CE', action: 'SELL', strikeOffset: 2, stopLossPct: 25 },
          { type: 'PE', action: 'SELL', strikeOffset: -2, stopLossPct: 25 },
        ],
      })
    );
    expect(otm.summary.netProfit).not.toBe(atm.summary.netProfit);
  });

  it('labels an ATM leg as ATM in the trade log', () => {
    const result = runBacktest(straddleRule());
    expect(result.tradeLogs.every((t) => t.instrument.includes('ATM'))).toBe(true);
  });
});

describe('runBacktest — exits', () => {
  it('never reports a profitable trade as a hard STOP_LOSS', () => {
    const result = runBacktest(
      straddleRule({
        legs: [
          {
            type: 'CE',
            action: 'SELL',
            strikeOffset: 0,
            stopLossPct: 40,
            trailingSL: { triggerPoints: 15, trailPoints: 8 },
          },
          {
            type: 'PE',
            action: 'SELL',
            strikeOffset: 0,
            stopLossPct: 40,
            trailingSL: { triggerPoints: 15, trailPoints: 8 },
          },
        ],
      })
    );

    // A hard stop can only fire against the position, so it must never be a winner.
    for (const trade of result.tradeLogs) {
      if (trade.exitReason === 'STOP_LOSS') {
        expect(trade.netPnL).toBeLessThan(0);
      }
    }
  });

  it('distinguishes trailing stops from hard stops', () => {
    const result = runBacktest(
      straddleRule({
        legs: [
          {
            type: 'CE',
            action: 'SELL',
            strikeOffset: 0,
            stopLossPct: 60,
            trailingSL: { triggerPoints: 10, trailPoints: 5 },
          },
        ],
      })
    );
    expect(result.tradeLogs.some((t) => t.exitReason === 'TRAILING_STOP')).toBe(true);
  });

  it('books a take-profit exit when targetPct is set', () => {
    const result = runBacktest(
      straddleRule({
        legs: [
          { type: 'CE', action: 'SELL', strikeOffset: 0, targetPct: 30 },
          { type: 'PE', action: 'SELL', strikeOffset: 0, targetPct: 30 },
        ],
      })
    );
    expect(result.tradeLogs.some((t) => t.exitReason === 'TARGET')).toBe(true);
    for (const trade of result.tradeLogs) {
      if (trade.exitReason === 'TARGET') expect(trade.grossPnL).toBeGreaterThan(0);
    }
  });

  it('exits no later than the requested exit time', () => {
    const result = runBacktest(straddleRule({ entryTime: '09:20', exitTime: '11:00' }));
    for (const trade of result.tradeLogs) {
      expect(trade.exitTime <= '11:00').toBe(true);
    }
  });
});

describe('runBacktest — accounting', () => {
  it('deducts statutory charges on both sides of every leg', () => {
    const result = runBacktest(straddleRule());
    for (const trade of result.tradeLogs) {
      expect(trade.charges).toBeGreaterThan(0);
      expect(trade.netPnL).toBe(trade.grossPnL - trade.charges);
    }
  });

  it('keeps the summary internally consistent with the trade log', () => {
    const result = runBacktest(straddleRule());
    const { summary, tradeLogs } = result;
    expect(summary.totalTrades).toBe(tradeLogs.length);
    expect(summary.winningTrades + summary.losingTrades).toBe(tradeLogs.length);
    expect(summary.totalCharges).toBeCloseTo(
      tradeLogs.reduce((a, t) => a + t.charges, 0),
      0
    );
    expect(summary.netProfit).toBe(tradeLogs.reduce((a, t) => a + t.netPnL, 0));
  });

  it('accumulates the equity curve day by day', () => {
    const result = runBacktest(straddleRule(), { startingEquity: 1000000 });
    let running = 1000000;
    for (const day of result.dailyPnL) {
      running += day.netPnL;
      expect(day.cumulativeEquity).toBeCloseTo(running, 0);
    }
  });

  it('charges more in a round trip than in a single leg', () => {
    const result = runBacktest(straddleRule());
    for (const trade of result.tradeLogs) {
      // Two brokerage charges of 20 plus turnover charges on both sides.
      expect(trade.charges).toBeGreaterThan(40);
    }
  });
});

describe('computeSharpe', () => {
  const mk = (netPnL: number): BacktestTradeLog => ({
    id: `x${netPnL}`,
    date: '2026-01-01',
    entryTime: '09:20',
    exitTime: '10:00',
    instrument: 'NIFTY 25000 CE (ATM)',
    action: 'SELL',
    entryPrice: 100,
    exitPrice: 110,
    qty: 75,
    grossPnL: netPnL,
    charges: 0,
    netPnL,
    exitReason: 'TIME_EXIT',
  });

  it('returns null rather than a fabricated number for fewer than two trades', () => {
    expect(computeSharpe([], 1000000)).toBeNull();
    expect(computeSharpe([mk(1000)], 1000000)).toBeNull();
  });

  it('returns null when the return series has no dispersion', () => {
    expect(computeSharpe([mk(1000), mk(1000), mk(1000)], 1000000)).toBeNull();
  });

  it('is positive for a consistently profitable series', () => {
    const sharpe = computeSharpe([mk(5000), mk(4000), mk(6000), mk(3000)], 1000000);
    expect(sharpe).not.toBeNull();
    expect(sharpe!).toBeGreaterThan(0);
  });

  it('is negative for a consistently losing series', () => {
    const sharpe = computeSharpe([mk(-5000), mk(-4000), mk(-6000)], 1000000);
    expect(sharpe!).toBeLessThan(0);
  });

  it('reproduces the textbook Sharpe for a known two-trade series', () => {
    // Returns of 0.002 and 0: mean 0.001, sample sd 0.002/sqrt(2).
    // Ratio = 1/sqrt(2), annualised by sqrt(252) gives sqrt(126) = 11.2249.
    const sharpe = computeSharpe([mk(2000), mk(0)], 1000000);
    expect(sharpe).toBeCloseTo(Math.sqrt(126), 2);
  });
});

describe('backtest summary never fabricates metrics', () => {
  it('reports a null Sharpe and no trades for an empty run', () => {
    const result = runBacktest(straddleRule({ underlying: 'SENSEX' }));
    expect(result.summary.totalTrades).toBe(0);
    expect(result.summary.sharpeRatio).toBeNull();
    expect(result.summary.winRate).toBe(0);
    expect(result.summary.netProfit).toBe(0);
  });
});
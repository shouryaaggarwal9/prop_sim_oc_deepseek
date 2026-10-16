import { describe, expect, it } from 'vitest';
import {
  closePositions,
  createClosedTrade,
  realisedPnlForDate,
  summariseTradeLedger,
} from '@/lib/engine/tradeLedger';
import {
  createPropAccount,
  evaluatePropRisk,
  requestPayout,
  rollOverTradingDay,
} from '@/lib/engine/propRisk';
import type { IndianCharges, Position } from '@/lib/types';

const NO_CHARGES: IndianCharges = {
  stt: 0,
  exchangeTurnover: 0,
  sebiCharges: 0,
  stampDuty: 0,
  gst: 0,
  brokerage: 0,
  totalCharges: 0,
};

function chargeOf(total: number): IndianCharges {
  return { ...NO_CHARGES, brokerage: total, totalCharges: total };
}

/** A marked, profitable short call: sold at 150, now worth 100, 75 to a lot. */
function leg(overrides: Partial<Position> = {}): Position {
  return {
    id: 'POS-1',
    symbol: 'NIFTY 25000 CE',
    underlying: 'NIFTY',
    type: 'CE',
    action: 'SELL',
    strike: 25000,
    strikeOffset: 0,
    expiry: '2026-01-01',
    lots: 1,
    qty: 75,
    entryPrice: 150,
    currentPrice: 100,
    unrealizedPnL: 3750,
    realizedPnL: 0,
    charges: chargeOf(38),
    openedAt: '2026-01-01T03:45:00.000Z',
    ...overrides,
  };
}

describe('closePositions', () => {
  it('leaves the account untouched when there is nothing to close', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const result = closePositions(acc, [], 'MANUAL');
    expect(result.account).toBe(acc);
    expect(result.trades).toHaveLength(0);
  });

  it('books the summed realised P&L into the balance', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const { account } = closePositions(
      acc,
      [leg({ id: 'a', unrealizedPnL: 3750 }), leg({ id: 'b', unrealizedPnL: -1250 })],
      'SQUARE_OFF_ALL'
    );

    expect(account.currentBalance).toBe(1002500);
    expect(account.currentEquity).toBe(1002500);
  });

  it('records one entry per leg, at the mark it was closed on', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const { account, trades } = closePositions(
      acc,
      [leg()],
      'MANUAL',
      '2026-01-02T10:00:00.000Z'
    );

    expect(account.closedTrades).toHaveLength(1);
    const trade = trades[0]!;
    expect(trade.entryPrice).toBe(150);
    expect(trade.exitPrice).toBe(100);
    expect(trade.realizedPnL).toBe(3750);
    expect(trade.qty).toBe(75);
    expect(trade.exitReason).toBe('MANUAL');
    expect(trade.phase).toBe('PHASE_1');
    expect(trade.closedAt).toBe('2026-01-02T10:00:00.000Z');
    expect(trade.charges.totalCharges).toBe(38);
  });

  it('never lets the ledger and the balance disagree', () => {
    // The invariant that makes the ledger trustworthy: the sum of realised P&L
    // booked into the ledger equals the movement in the balance.
    let acc = createPropAccount('T', 'pro-10l');
    const start = acc.currentBalance;

    acc = closePositions(acc, [leg({ id: 'a', unrealizedPnL: 3750 })], 'MANUAL').account;
    acc = closePositions(acc, [leg({ id: 'b', unrealizedPnL: -900 })], 'MANUAL').account;
    acc = closePositions(acc, [leg({ id: 'c', unrealizedPnL: 12000 })], 'SQUARE_OFF_ALL').account;

    const ledgerTotal = acc.closedTrades.reduce((sum, t) => sum + t.realizedPnL, 0);
    expect(ledgerTotal).toBe(14850);
    expect(acc.closedTrades).toHaveLength(3);
    expect(acc.currentBalance - start).toBe(ledgerTotal);
  });

  it('records a risk-breach liquidation like any other close', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const { account } = closePositions(acc, [leg()], 'RISK_BREACH');
    expect(account.closedTrades[0]!.exitReason).toBe('RISK_BREACH');
  });

  it('preserves the ledger across a phase promotion', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = closePositions(acc, [leg()], 'MANUAL').account;

    acc = rollOverTradingDay(acc, 0, '2026-01-01');
    acc = rollOverTradingDay(acc, 0, '2026-01-02');
    acc = rollOverTradingDay(acc, 0, '2026-01-03');
    acc = {
      ...acc,
      currentBalance: 1120000,
      currentEquity: 1120000,
      startingDayEquity: 1120000,
    };

    const promoted = evaluatePropRisk(acc, 0).updatedAccount;
    expect(promoted.phase).toBe('PHASE_2');
    // The per-phase counters reset, but the trader's journal does not.
    expect(promoted.dailyPnLHistory).toHaveLength(0);
    expect(promoted.closedTrades).toHaveLength(1);
  });
});

describe('createClosedTrade', () => {
  it('copies the exit mark verbatim rather than recomputing it', () => {
    const trade = createClosedTrade(leg(), 'REPLAY_EXIT', 'FUNDED', '2026-01-03T05:00:00.000Z');
    expect(trade.exitPrice).toBe(100);
    expect(trade.realizedPnL).toBe(3750);
    expect(trade.phase).toBe('FUNDED');
    expect(trade.id).toMatch(/^TRD-/);
  });
});

describe('realisedPnlForDate', () => {
  it('sums only the legs closed on that calendar date', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = closePositions(acc, [leg({ id: 'a', unrealizedPnL: 3750 })], 'MANUAL', '2026-01-01T05:00:00.000Z').account;
    acc = closePositions(acc, [leg({ id: 'b', unrealizedPnL: -900 })], 'MANUAL', '2026-01-02T05:00:00.000Z').account;

    expect(realisedPnlForDate(acc.closedTrades, '2026-01-01')).toBe(3750);
    expect(realisedPnlForDate(acc.closedTrades, '2026-01-02')).toBe(-900);
    expect(realisedPnlForDate(acc.closedTrades, '2026-01-03')).toBe(0);
  });
});

describe('rollOverTradingDay — recorded day P&L', () => {
  it('records the passed P&L by default, so existing callers are unchanged', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 2000, '2026-01-01');
    expect(acc.dailyPnLHistory[0]!.pnl).toBe(2000);
    expect(acc.currentBalance).toBe(1002000);
  });

  it('records a separate figure without crediting the balance twice', () => {
    // The prop terminal books each close itself, so it passes 0 for the balance
    // delta and supplies the day's true figure for the history.
    let acc = createPropAccount('T', 'pro-10l');
    const stamp = `${acc.currentTradingDate}T05:00:00.000Z`;
    acc = closePositions(acc, [leg({ id: 'a', unrealizedPnL: 30000 })], 'MANUAL', stamp).account;
    expect(acc.currentBalance).toBe(1030000);

    const dayPnl = realisedPnlForDate(acc.closedTrades, acc.currentTradingDate);
    const rolled = rollOverTradingDay(acc, 0, undefined, dayPnl);

    expect(rolled.dailyPnLHistory.at(-1)!.pnl).toBe(30000);
    expect(rolled.currentBalance).toBe(1030000);
    expect(rolled.startingDayEquity).toBe(1030000);
  });

  it('changes nothing about the balance when both arguments are zero', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 0, '2026-01-01', 0);
    expect(acc.currentBalance).toBe(1000000);
    expect(acc.dailyPnLHistory[0]!.pnl).toBe(0);
    expect(acc.tradingDays).toBe(1);
  });
});

describe('payout flattening', () => {
  it('keeps balance, ledger and payouts reconciled', () => {
    let acc = createPropAccount('T', 'funded-direct-10l', true);
    const start = acc.initialBalance;

    acc = closePositions(acc, [leg({ id: 'a', unrealizedPnL: 200000 })], 'MANUAL').account;
    const { account: flattened } = closePositions(
      acc,
      [leg({ id: 'b', unrealizedPnL: 50000 })],
      'PAYOUT_FLATTEN'
    );
    const { updatedAccount, error } = requestPayout(flattened, 100000);

    expect(error).toBeUndefined();
    const ledgerTotal = updatedAccount.closedTrades.reduce((sum, t) => sum + t.realizedPnL, 0);
    const paidOut = updatedAccount.payouts.reduce((sum, p) => sum + p.amount, 0);
    expect(updatedAccount.currentBalance).toBe(start + ledgerTotal - paidOut);
    expect(updatedAccount.closedTrades).toHaveLength(2);
  });
});

describe('summariseTradeLedger', () => {
  it('reports zeroes rather than NaN for an empty ledger', () => {
    const summary = summariseTradeLedger([]);
    expect(summary.totalTrades).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.realizedPnL).toBe(0);
    expect(summary.profitFactor).toBeNull();
  });

  it('computes win rate, profit factor and averages', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const { account } = closePositions(
      acc,
      [
        leg({ id: 'a', unrealizedPnL: 5000, charges: chargeOf(40) }),
        leg({ id: 'b', unrealizedPnL: 2000, charges: chargeOf(40) }),
        leg({ id: 'c', unrealizedPnL: -1000, charges: chargeOf(40) }),
        leg({ id: 'd', unrealizedPnL: -3000, charges: chargeOf(40) }),
      ],
      'SQUARE_OFF_ALL'
    );

    const summary = summariseTradeLedger(account.closedTrades);
    expect(summary.totalTrades).toBe(4);
    expect(summary.winningTrades).toBe(2);
    expect(summary.losingTrades).toBe(2);
    expect(summary.winRate).toBeCloseTo(50, 6);
    expect(summary.grossProfit).toBe(7000);
    expect(summary.grossLoss).toBe(4000);
    expect(summary.profitFactor).toBeCloseTo(1.75, 6);
    expect(summary.realizedPnL).toBe(3000);
    expect(summary.averageWin).toBeCloseTo(3500, 6);
    expect(summary.averageLoss).toBeCloseTo(2000, 6);
    expect(summary.totalCharges).toBe(160);
  });

  it('returns a null profit factor rather than a fabricated number when nothing lost', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const { account } = closePositions(acc, [leg({ unrealizedPnL: 500 })], 'MANUAL');
    expect(summariseTradeLedger(account.closedTrades).profitFactor).toBeNull();
  });
});

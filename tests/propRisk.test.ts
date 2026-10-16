import { describe, expect, it } from 'vitest';
import {
  bookRealizedPnl,
  createPropAccount,
  evaluatePropRisk,
  requestPayout,
  rollOverTradingDay,
  syncTradingDate,
  targetForPhase,
  violatesConsistencyRule,
  withdrawableProfit,
} from '@/lib/engine/propRisk';
import type { PropAccount } from '@/lib/types';

/**
 * Drive an account to a target equity by booking realised P&L, rolling days
 * forward as a real trader would.
 */
function advance(
  account: PropAccount,
  totalProfit: number,
  { minDays }: { minDays?: number } = {}
): PropAccount {
  let acc = account;
  const days = minDays ?? acc.ruleConfig.minTradingDays;

  for (let d = 0; d < days; d += 1) {
    const slice = totalProfit / (days + 1);
    acc = rollOverTradingDay(acc, slice, `2026-01-0${d + 1}`);
  }
  // Book the remainder as the final day's realised P&L.
  acc = {
    ...acc,
    currentBalance: acc.initialBalance + totalProfit,
    currentEquity: acc.initialBalance + totalProfit,
    startingDayEquity: acc.initialBalance + totalProfit,
  };
  return acc;
}

describe('createPropAccount', () => {
  it('starts a phase-1 evaluation at the preset account size', () => {
    const acc = createPropAccount('Test', 'pro-10l');
    expect(acc.initialBalance).toBe(1000000);
    expect(acc.phase).toBe('PHASE_1');
    expect(acc.status).toBe('ACTIVE');
    expect(acc.tradingDays).toBe(0);
    expect(acc.currentTradingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('starts an instant-funded account already in the funded phase', () => {
    const acc = createPropAccount('Test', 'funded-direct-10l', true);
    expect(acc.phase).toBe('FUNDED');
  });

  it('falls back to the pro preset for an unknown id rather than throwing', () => {
    const acc = createPropAccount('Test', 'does-not-exist');
    expect(acc.ruleConfig.id).toBe('pro-10l');
  });

  it('generates a unique id per account', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => createPropAccount('T', 'pro-10l').id)
    );
    expect(ids.size).toBe(50);
  });
});

describe('rollOverTradingDay', () => {
  it('increments the trading-day counter', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 1000, '2026-01-01');
    acc = rollOverTradingDay(acc, 500, '2026-01-02');
    acc = rollOverTradingDay(acc, -200, '2026-01-03');
    expect(acc.tradingDays).toBe(3);
    expect(acc.dailyPnLHistory).toHaveLength(3);
  });

  it('re-anchors the daily loss limit to the new opening equity', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 100000, '2026-01-01');
    // New balance 1.1M, daily limit 5% of the *day's opening* equity = 55000.
    expect(acc.startingDayEquity).toBe(1100000);
    expect(acc.dailyLossFloor).toBeCloseTo(1100000 * 0.95, 2);
  });

  it('is idempotent for a repeated date so a day cannot be double counted', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 1000, '2026-01-01');
    acc = rollOverTradingDay(acc, 2000, '2026-01-01');
    expect(acc.tradingDays).toBe(1);
    expect(acc.dailyPnLHistory).toHaveLength(1);
    expect(acc.dailyPnLHistory[0]!.pnl).toBe(2000);
  });

  it('is a no-op once the account has failed', () => {
    const failed: PropAccount = { ...createPropAccount('T', 'pro-10l'), status: 'FAILED' };
    expect(rollOverTradingDay(failed, 1000, '2026-01-01')).toBe(failed);
  });
});

describe('syncTradingDate', () => {
  it('re-anchors the daily loss when the calendar day rolls over', () => {
    const acc: PropAccount = {
      ...createPropAccount('T', 'pro-10l'),
      currentTradingDate: '2020-01-01',
      currentEquity: 1200000,
    };
    const synced = syncTradingDate(acc);
    expect(synced.startingDayEquity).toBe(1200000);
    expect(synced.dailyLossFloor).toBeCloseTo(1200000 * 0.95, 2);
  });

  it('does nothing when the date is unchanged', () => {
    const acc = createPropAccount('T', 'pro-10l');
    expect(syncTradingDate(acc)).toBe(acc);
  });
});

describe('evaluatePropRisk — drawdown governance', () => {
  it('fails the account when the daily loss floor is breached', () => {
    const acc = createPropAccount('T', 'pro-10l');
    // 5% of 1,000,000 is 50,000; -50,001 must breach.
    const result = evaluatePropRisk(bookRealizedPnl(acc, -50001), 0);
    expect(result.hasBreached).toBe(true);
    expect(result.updatedAccount.status).toBe('FAILED');
    expect(result.breachReason).toMatch(/daily loss/i);
  });

  it('does not breach exactly at the floor boundary minus a rupee', () => {
    const acc = createPropAccount('T', 'pro-10l');
    expect(evaluatePropRisk(bookRealizedPnl(acc, -49999), 0).hasBreached).toBe(false);
  });

  it('reports the trailing breach once the floor has trailed above the daily floor', () => {
    // A 5% daily limit always binds before a 10% trailing limit at inception,
    // so the trailing floor can only be tested after equity has rallied.
    const base = createPropAccount('T', 'pro-10l');
    const rallied = evaluatePropRisk(bookRealizedPnl(base, 150000), 0).updatedAccount;
    expect(rallied.highWaterMark).toBe(1150000);
    // Breakeven lock holds the floor at the 1,000,000 opening balance.
    expect(rallied.maxLossFloor).toBe(1000000);
    // Daily floor is still 5% of the day's opening equity (950,000).
    expect(rallied.dailyLossFloor).toBe(950000);

    const result = evaluatePropRisk(bookRealizedPnl(rallied, -150000), 0);
    expect(result.updatedAccount.currentEquity).toBe(1000000);
    expect(result.hasBreached).toBe(true);
    expect(result.breachReason).toMatch(/trailing/i);
  });

  it('reports the daily breach first when the daily limit binds earlier', () => {
    // Pro preset: 5% daily = 50,000 binds before the 10% trailing floor at 900,000.
    const acc = createPropAccount('T', 'pro-10l');
    const result = evaluatePropRisk(bookRealizedPnl(acc, -100001), 0);
    expect(result.hasBreached).toBe(true);
    expect(result.breachReason).toMatch(/daily loss/i);
  });

  it('trails the floor up as equity makes new highs', () => {
    const acc = createPropAccount('T', 'pro-10l');
    const up = evaluatePropRisk(bookRealizedPnl(acc, 200000), 0);
    expect(up.updatedAccount.highWaterMark).toBe(1200000);
    // Floor cannot rise above the opening balance once in profit (breakeven lock).
    expect(up.updatedAccount.maxLossFloor).toBe(1000000);

    const down = evaluatePropRisk(up.updatedAccount, 0);
    expect(down.updatedAccount.maxLossFloor).toBe(1000000);
    expect(down.hasBreached).toBe(false);
  });

  it('fails once equity falls back to the locked breakeven floor', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = evaluatePropRisk(bookRealizedPnl(acc, 200000), 0).updatedAccount;
    const result = evaluatePropRisk(bookRealizedPnl(acc, -200000), 0);
    expect(result.hasBreached).toBe(true);
    expect(result.updatedAccount.status).toBe('FAILED');
  });

  it('uses the daily, not inception, equity after a rollover', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 200000, '2026-01-01');
    expect(acc.startingDayEquity).toBe(1200000);
    // A 60k loss is under 5% of the day's opening equity (60k), and strictly
    // under the account-size-based daily limit, so it must survive.
    expect(evaluatePropRisk(bookRealizedPnl(acc, -59000), 0).hasBreached).toBe(false);
  });

  it('is inert once the account is no longer active', () => {
    const failed: PropAccount = { ...createPropAccount('T', 'pro-10l'), status: 'FAILED' };
    const result = evaluatePropRisk(failed, 0);
    expect(result.hasBreached).toBe(true);
    expect(result.updatedAccount).toBe(failed);
  });
});

describe('evaluatePropRisk — phase progression', () => {
  it('will NOT pass without the minimum trading days', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = { ...acc, currentBalance: 1200000, currentEquity: 1200000, startingDayEquity: 1200000 };
    const result = evaluatePropRisk(acc, 0);
    expect(result.hasPassedPhase).toBe(false);
    expect(acc.tradingDays).toBeLessThan(acc.ruleConfig.minTradingDays);
  });

  it('passes phase 1 once the target and minimum days are both met', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = advance(acc, 120000);
    expect(acc.tradingDays).toBeGreaterThanOrEqual(acc.ruleConfig.minTradingDays);

    const result = evaluatePropRisk(acc, 0);
    expect(result.hasPassedPhase).toBe(true);
    expect(result.nextPhase).toBe('PHASE_2');
    expect(result.updatedAccount.phase).toBe('PHASE_2');
  });

  it('resets balance, day counter and consistency history on phase change', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = advance(acc, 120000);
    const promoted = evaluatePropRisk(acc, 0).updatedAccount;

    expect(promoted.currentBalance).toBe(promoted.initialBalance);
    expect(promoted.currentEquity).toBe(promoted.initialBalance);
    expect(promoted.tradingDays).toBe(0);
    expect(promoted.dailyPnLHistory).toHaveLength(0);
  });

  it('reaches FUNDED with a certificate after clearing phase 2', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = advance(acc, 120000);
    acc = evaluatePropRisk(acc, 0).updatedAccount;

    // Phase 2 target is 5% of 1,000,000.
    acc = advance(acc, 60000);
    const result = evaluatePropRisk(acc, 0);

    expect(result.hasPassedPhase).toBe(true);
    expect(result.updatedAccount.phase).toBe('FUNDED');
    expect(result.updatedAccount.status).toBe('PASSED');
    expect(result.updatedAccount.passCertificateId).toMatch(/^CERT-/);
  });

  it('requires a fresh set of trading days for each phase', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = advance(acc, 120000);
    acc = evaluatePropRisk(acc, 0).updatedAccount;

    // Immediately hitting the phase-2 target with zero days must not pass.
    const target = 60000;
    acc = {
      ...acc,
      currentBalance: acc.initialBalance + target,
      currentEquity: acc.initialBalance + target,
      startingDayEquity: acc.initialBalance + target,
    };
    expect(acc.tradingDays).toBe(0);
    expect(evaluatePropRisk(acc, 0).hasPassedPhase).toBe(false);
  });
});

describe('consistency rule', () => {
  it('does not fire on an empty history', () => {
    const acc = createPropAccount('T', 'pro-10l');
    expect(violatesConsistencyRule(acc)).toBe(false);
  });

  it('fires when a single day exceeds the allowed share of the target', () => {
    // Phase-1 target is 100,000; the allowance is 35% = 35,000.
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 50000, '2026-01-01');
    expect(violatesConsistencyRule(acc)).toBe(true);
  });

  it('stays quiet when every day is inside the allowance', () => {
    let acc = createPropAccount('T', 'pro-10l');
    acc = rollOverTradingDay(acc, 20000, '2026-01-01');
    acc = rollOverTradingDay(acc, 15000, '2026-01-02');
    expect(violatesConsistencyRule(acc)).toBe(false);
  });

  it('blocks phase promotion when the rule is violated', () => {
    let acc = createPropAccount('T', 'pro-10l');
    // One huge day blows the consistency allowance, later days finish the target.
    acc = rollOverTradingDay(acc, 60000, '2026-01-01');
    acc = rollOverTradingDay(acc, 40000, '2026-01-02');
    acc = rollOverTradingDay(acc, 40000, '2026-01-03');

    const result = evaluatePropRisk(acc, 0);
    expect(result.hasPassedPhase).toBe(false);
    expect(result.hasBreached).toBe(false);
  });
});

describe('targetForPhase', () => {
  it('uses the phase-specific target percentage', () => {
    const acc = createPropAccount('T', 'pro-10l');
    expect(targetForPhase(acc)).toBe(100000);
    expect(targetForPhase({ ...acc, phase: 'PHASE_2' })).toBe(50000);
    expect(targetForPhase({ ...acc, phase: 'FUNDED' })).toBe(0);
  });
});

describe('payouts', () => {
  function fundedAccountWithProfit(profit: number): PropAccount {
    return {
      ...createPropAccount('T', 'funded-direct-10l', true),
      currentBalance: 1000000 + profit,
      currentEquity: 1000000 + profit,
      highWaterMark: 1000000 + profit,
    };
  }

  it('reports withdrawable profit as balance above the opening size', () => {
    expect(withdrawableProfit(fundedAccountWithProfit(250000))).toBe(250000);
    expect(withdrawableProfit(fundedAccountWithProfit(-50000))).toBe(0);
  });

  it('applies the configured profit split', () => {
    const acc = fundedAccountWithProfit(200000);
    const split = acc.ruleConfig.profitSplitPct / 100;
    const { updatedAccount, error } = requestPayout(acc, 200000 * split);
    expect(error).toBeUndefined();
    expect(updatedAccount.currentBalance).toBeCloseTo(1000000 + 200000 * (1 - split), 2);
    expect(updatedAccount.payouts).toHaveLength(1);
    expect(updatedAccount.payouts[0]!.splitPct).toBe(acc.ruleConfig.profitSplitPct);
  });

  it('rejects a withdrawal larger than available profit', () => {
    const { updatedAccount, error } = requestPayout(fundedAccountWithProfit(100000), 150000);
    expect(error).toMatch(/available/i);
    expect(updatedAccount.currentBalance).toBe(1100000);
  });

  it('rejects non-positive amounts', () => {
    const acc = fundedAccountWithProfit(100000);
    expect(requestPayout(acc, 0).error).toBeTruthy();
    expect(requestPayout(acc, -500).error).toBeTruthy();
  });

  it('rejects a withdrawal that would breach the trailing floor', () => {
    // 4% daily limit, 6% trailing on 1,000,000 -> floor 940,000.
    const acc = fundedAccountWithProfit(50000);
    const { error } = requestPayout(acc, 200000);
    expect(error).toMatch(/floor|available/i);
  });

  it('re-anchors the daily loss limit so a withdrawal is not a trading loss', () => {
    // Withdrawing profit must not instantly consume the day's daily allowance.
    const acc: PropAccount = {
      ...fundedAccountWithProfit(200000),
      startingDayEquity: 1200000,
      dailyLossFloor: 1140000,
    };
    const rate = acc.ruleConfig.dailyLossPct / 100;
    const { updatedAccount } = requestPayout(acc, 170000);
    expect(updatedAccount.currentBalance).toBe(1030000);
    expect(updatedAccount.startingDayEquity).toBe(1030000);
    expect(updatedAccount.dailyLossFloor).toBeCloseTo(1030000 * (1 - rate), 2);
    expect(evaluatePropRisk(updatedAccount, 0).hasBreached).toBe(false);
  });

  it('allows a passed funded account to withdraw', () => {
    // Reaching FUNDED sets status to PASSED, so gating on ACTIVE would lock the
    // payout desk permanently on exactly the account that earned it.
    const acc: PropAccount = { ...fundedAccountWithProfit(200000), status: 'PASSED' };
    const { updatedAccount, error } = requestPayout(acc, 100000);
    expect(error).toBeUndefined();
    expect(updatedAccount.currentBalance).toBe(1100000);
    expect(updatedAccount.payouts).toHaveLength(1);
  });

  it('refuses payouts on a failed funded account', () => {
    const acc: PropAccount = { ...fundedAccountWithProfit(200000), status: 'FAILED' };
    expect(requestPayout(acc, 1000).error).toMatch(/funded/i);
  });

  it('refuses payouts on an evaluation-phase account', () => {
    const acc = createPropAccount('T', 'pro-10l');
    expect(requestPayout(acc, 1000).error).toMatch(/funded/i);
  });
});
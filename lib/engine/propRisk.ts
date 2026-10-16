import {
  type ChallengePhase,
  type ChallengeRuleConfig,
  type PropAccount,
  type PayoutRecord,
  TRADING_DAYS_PER_YEAR,
} from '../types';

export const DEFAULT_CHALLENGE_PRESETS: ChallengeRuleConfig[] = [
  {
    id: 'starter-5l',
    name: 'Starter Evaluation (₹5 Lakhs)',
    accountSize: 500000,
    phase1TargetPct: 10,
    phase2TargetPct: 5,
    dailyLossPct: 5,
    maxTrailingLossPct: 10,
    minTradingDays: 3,
    maxSingleDayProfitPct: 35,
    profitSplitPct: 80,
  },
  {
    id: 'pro-10l',
    name: 'Pro Evaluation (₹10 Lakhs)',
    accountSize: 1000000,
    phase1TargetPct: 10,
    phase2TargetPct: 5,
    dailyLossPct: 5,
    maxTrailingLossPct: 10,
    minTradingDays: 3,
    maxSingleDayProfitPct: 35,
    profitSplitPct: 85,
  },
  {
    id: 'elite-25l',
    name: 'Elite Evaluation (₹25 Lakhs)',
    accountSize: 2505000,
    phase1TargetPct: 8,
    phase2TargetPct: 5,
    dailyLossPct: 5,
    maxTrailingLossPct: 8,
    minTradingDays: 4,
    maxSingleDayProfitPct: 30,
    profitSplitPct: 90,
  },
  {
    id: 'funded-direct-10l',
    name: 'Instant Funded Simulated (₹10 Lakhs)',
    accountSize: 1000000,
    phase1TargetPct: 0,
    phase2TargetPct: 0,
    dailyLossPct: 4,
    maxTrailingLossPct: 6,
    minTradingDays: 1,
    maxSingleDayProfitPct: 30,
    profitSplitPct: 80,
  },
];

export function getPreset(presetId: string): ChallengeRuleConfig {
  return (
    DEFAULT_CHALLENGE_PRESETS.find((p) => p.id === presetId) ??
    DEFAULT_CHALLENGE_PRESETS[1]!
  );
}

/** ISO calendar date (YYYY-MM-DD) for the current day. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeId(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${random.toUpperCase()}`;
}

export function createPropAccount(
  traderName: string,
  presetId = 'pro-10l',
  instantFunded = false
): PropAccount {
  const preset = getPreset(presetId);
  const initial = preset.accountSize;

  return {
    id: makeId('ACC'),
    traderName: traderName.trim() || 'Trader One',
    ruleConfig: preset,
    phase: instantFunded ? 'FUNDED' : 'PHASE_1',
    status: 'ACTIVE',
    initialBalance: initial,
    currentBalance: initial,
    currentEquity: initial,
    highWaterMark: initial,
    startingDayEquity: initial,
    dailyLossFloor: initial * (1 - preset.dailyLossPct / 100),
    maxLossFloor: initial * (1 - preset.maxTrailingLossPct / 100),
    tradingDays: 0,
    dailyPnLHistory: [],
    payouts: [],
    closedTrades: [],
    createdAt: new Date().toISOString(),
    currentTradingDate: todayIso(),
  };
}

/**
 * Book realised P&L into the account balance. This is the only way equity
 * should change hands-on, keeping the balance the single source of truth that
 * `evaluatePropRisk` reads from.
 */
export function bookRealizedPnl(account: PropAccount, realizedPnl: number): PropAccount {
  const nextBalance = account.currentBalance + realizedPnl;
  return {
    ...account,
    currentBalance: nextBalance,
    currentEquity: nextBalance,
    highWaterMark: Math.max(account.highWaterMark, nextBalance),
  };
}

export interface RiskEvaluationResult {
  updatedAccount: PropAccount;
  hasBreached: boolean;
  breachReason?: string;
  hasPassedPhase: boolean;
  nextPhase?: ChallengePhase;
}

/**
 * Profit needed to satisfy the current phase target.
 * Funded accounts have no target and return 0.
 */
export function targetForPhase(account: PropAccount): number {
  if (account.phase === 'PHASE_1') {
    return account.initialBalance * (account.ruleConfig.phase1TargetPct / 100);
  }
  if (account.phase === 'PHASE_2') {
    return account.initialBalance * (account.ruleConfig.phase2TargetPct / 100);
  }
  return 0;
}

/**
 * Consistency rule: no single day's realised profit may exceed this share of
 * the phase target. Evaluated against the *closed* day history, so the day in
 * progress is deliberately excluded.
 */
export function violatesConsistencyRule(account: PropAccount): boolean {
  const target = targetForPhase(account);
  if (target <= 0) return false;
  const allowance = target * (account.ruleConfig.maxSingleDayProfitPct / 100);
  return account.dailyPnLHistory.some((d) => d.pnl > allowance);
}

/**
 * Real-time prop risk monitor and liquidation guardian.
 *
 * Re-evaluates equity against the daily loss floor and the trailing
 * high-water-mark floor, then checks phase progression. Call this on every
 * mark-to-market tick and at end of day.
 *
 * Realised P&L must already be reflected in `account.currentBalance`; this
 * function derives equity from the balance and open P&L alone, so there is a
 * single source of truth for account value and no risk of double counting.
 *
 * @param unrealizedPnL Mark-to-market P&L of open positions, already net of charges.
 */
export function evaluatePropRisk(
  account: PropAccount,
  unrealizedPnL: number
): RiskEvaluationResult {
  // A failed account is terminal; nothing further is evaluated.
  if (account.status === 'FAILED') {
    return { updatedAccount: account, hasBreached: true, hasPassedPhase: false };
  }

  // A PASSED funded account is still trading simulated capital, so it keeps its
  // live equity and breach monitoring; it simply has no phase left to progress.
  const canProgress = account.status === 'ACTIVE';

  const currentEquity = account.currentBalance + unrealizedPnL;
  const highWaterMark = Math.max(account.highWaterMark, currentEquity);

  // Trailing floor: the high-water mark less the configured distance, which
  // locks at the opening balance once the account is in profit so that a
  // profitable account can never be pushed back below break-even.
  const trailingDistance =
    account.ruleConfig.accountSize * (account.ruleConfig.maxTrailingLossPct / 100);
  const maxLossFloor = Math.min(
    account.initialBalance,
    Math.max(account.maxLossFloor, highWaterMark - trailingDistance)
  );

  // Daily loss floor is anchored to the day's opening equity and therefore
  // resets on every rollover.
  const dayPnl = currentEquity - account.startingDayEquity;
  const maxAllowedDailyLoss =
    account.startingDayEquity * (account.ruleConfig.dailyLossPct / 100);
  const dailyLossFloor = account.startingDayEquity - maxAllowedDailyLoss;

  const updatedAccount: PropAccount = {
    ...account,
    currentEquity,
    highWaterMark,
    maxLossFloor,
    dailyLossFloor,
    lastTradeDate: todayIso(),
  };

  // 1. Daily loss breach.
  if (currentEquity <= dailyLossFloor) {
    updatedAccount.status = 'FAILED';
    updatedAccount.breachReason =
      `Daily loss limit breached: equity fell to ${fmt(currentEquity)}, which is at or below the ` +
      `${account.ruleConfig.dailyLossPct}% daily floor of ${fmt(dailyLossFloor)} ` +
      `(day P&L ${fmt(dayPnl)}, allowance ${fmt(maxAllowedDailyLoss)}).`;
    return {
      updatedAccount,
      hasBreached: true,
      breachReason: updatedAccount.breachReason,
      hasPassedPhase: false,
    };
  }

  // 2. Trailing maximum drawdown breach.
  if (currentEquity <= maxLossFloor) {
    updatedAccount.status = 'FAILED';
    updatedAccount.breachReason =
      `Maximum trailing drawdown breached: equity ${fmt(currentEquity)} fell to or below the ` +
      `high-water-mark floor of ${fmt(maxLossFloor)} (HWM ${fmt(highWaterMark)} less ` +
      `${account.ruleConfig.maxTrailingLossPct}% trailing distance of ${fmt(trailingDistance)}).`;
    return {
      updatedAccount,
      hasBreached: true,
      breachReason: updatedAccount.breachReason,
      hasPassedPhase: false,
    };
  }

  // 3. Profit target and phase progression.
  const targetAmount = targetForPhase(account);
  if (canProgress && targetAmount > 0) {
    const totalProfit = currentEquity - account.initialBalance;

    if (totalProfit >= targetAmount) {
      const daysSatisfied = account.tradingDays >= account.ruleConfig.minTradingDays;
      const consistent = !violatesConsistencyRule(account);

      if (daysSatisfied && consistent) {
        if (account.phase === 'PHASE_1') {
          return {
            updatedAccount: advancePhase(updatedAccount, 'PHASE_2'),
            hasBreached: false,
            hasPassedPhase: true,
            nextPhase: 'PHASE_2',
          };
        }
        if (account.phase === 'PHASE_2') {
          const passed: PropAccount = {
            ...advancePhase(updatedAccount, 'FUNDED'),
            status: 'PASSED',
            passCertificateId: makeId('CERT'),
          };
          return {
            updatedAccount: passed,
            hasBreached: false,
            hasPassedPhase: true,
            nextPhase: 'FUNDED',
          };
        }
      }
    }
  }

  return { updatedAccount, hasBreached: false, hasPassedPhase: false };
}

/**
 * Move to the next phase. A fresh phase restarts with a clean balance, a clean
 * day counter and a clean consistency history, mirroring how real two-phase
 * evaluations are structured.
 *
 * `closedTrades` is deliberately preserved: it is the trader's journal rather
 * than a per-phase counter, so a whole challenge's history survives promotion.
 */
function advancePhase(account: PropAccount, next: ChallengePhase): PropAccount {
  return {
    ...account,
    phase: next,
    currentBalance: account.initialBalance,
    currentEquity: account.initialBalance,
    highWaterMark: account.initialBalance,
    startingDayEquity: account.initialBalance,
    dailyLossFloor: account.initialBalance * (1 - account.ruleConfig.dailyLossPct / 100),
    maxLossFloor:
      account.initialBalance * (1 - account.ruleConfig.maxTrailingLossPct / 100),
    tradingDays: 0,
    dailyPnLHistory: [],
    payouts: [],
    currentTradingDate: todayIso(),
  };
}

/**
 * Close the trading day: book realised P&L into balance, append the day to the
 * consistency history, reset the daily anchor and advance the day counter.
 *
 * Only days that were actually traded are counted toward `minTradingDays`.
 *
 * @param dayRealizedPnL P&L that has NOT yet reached the balance.
 * @param recordedDayPnL The figure written to the day history. Defaults to
 *   `dayRealizedPnL`. Callers that book each close as it happens (the prop
 *   terminal does) pass 0 for `dayRealizedPnL` and supply the day's true figure
 *   here, so the history is accurate without the balance being credited twice.
 */
export function rollOverTradingDay(
  account: PropAccount,
  dayRealizedPnL: number,
  tradingDate?: string,
  recordedDayPnL: number = dayRealizedPnL
): PropAccount {
  if (account.status !== 'ACTIVE') return account;

  const date = tradingDate ?? todayIso();
  const newBalance = account.currentBalance + dayRealizedPnL;

  // A calendar date that has already been rolled over is a no-op, so repeated
  // end-of-day ticks cannot double-count a day.
  const alreadyRolled = account.dailyPnLHistory.some((d) => d.date === date);
  const history = alreadyRolled
    ? account.dailyPnLHistory.map((d) => (d.date === date ? { ...d, pnl: recordedDayPnL } : d))
    : [...account.dailyPnLHistory, { date, pnl: recordedDayPnL }];

  return {
    ...account,
    currentBalance: newBalance,
    currentEquity: newBalance,
    startingDayEquity: newBalance,
    dailyLossFloor: newBalance * (1 - account.ruleConfig.dailyLossPct / 100),
    // maxLossFloor is owned by evaluatePropRisk and intentionally left untouched.
    tradingDays: alreadyRolled ? account.tradingDays : account.tradingDays + 1,
    dailyPnLHistory: history,
    currentTradingDate: date,
    lastTradeDate: date,
  };
}

/**
 * Roll the calendar day forward if the session has crossed midnight, without
 * closing the trading day. Guards against a tab left open overnight silently
 * measuring the daily loss limit against yesterday's opening equity.
 */
export function syncTradingDate(account: PropAccount): PropAccount {
  const today = todayIso();
  if (account.currentTradingDate === today) return account;

  return {
    ...account,
    currentTradingDate: today,
    startingDayEquity: account.currentEquity,
    dailyLossFloor: account.currentEquity * (1 - account.ruleConfig.dailyLossPct / 100),
  };
}

/**
 * Withdraw the trader's profit share from a funded account.
 * Rejects non-positive amounts, over-withdrawals and withdrawals that would
 * breach the trailing floor.
 *
 * A passed funded account is still allowed to withdraw: reaching FUNDED sets
 * `status` to PASSED, so gating on ACTIVE here would permanently block the
 * payout desk. Only a failed or non-funded account is refused.
 */
export function requestPayout(
  account: PropAccount,
  amount: number
): { updatedAccount: PropAccount; error?: string } {
  if (account.phase !== 'FUNDED' || account.status === 'FAILED') {
    return {
      updatedAccount: account,
      error: 'Payouts are only available on an active funded account.',
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { updatedAccount: account, error: 'Payout amount must be a positive number.' };
  }

  const available = Math.max(0, account.currentBalance - account.initialBalance);
  if (amount > available) {
    return {
      updatedAccount: account,
      error: `Requested ${fmt(amount)} but only ${fmt(available)} of profit is available.`,
    };
  }

  const newBalance = account.currentBalance - amount;
  if (newBalance <= account.maxLossFloor) {
    return {
      updatedAccount: account,
      error: `Withdrawal would breach the trailing drawdown floor of ${fmt(account.maxLossFloor)}.`,
    };
  }

  const record: PayoutRecord = {
    id: makeId('PAY'),
    date: todayIso(),
    amount,
    splitPct: account.ruleConfig.profitSplitPct,
  };

  return {
    updatedAccount: {
      ...account,
      currentBalance: newBalance,
      currentEquity: newBalance,
      // Re-anchor the daily loss limit to the post-withdrawal balance. A
      // withdrawal of one's own profit is an account event, not a trading
      // loss, so it must not immediately consume the day's daily allowance.
      startingDayEquity: newBalance,
      dailyLossFloor: newBalance * (1 - account.ruleConfig.dailyLossPct / 100),
      currentTradingDate: todayIso(),
      payouts: [...account.payouts, record],
    },
  };
}

/** Profit currently eligible for withdrawal. */
export function withdrawableProfit(account: PropAccount): number {
  return Math.max(0, account.currentBalance - account.initialBalance);
}

function fmt(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** Exposed for tests: converts a day count to a Black-Scholes year fraction. */
export function daysToYearFraction(days: number): number {
  return days / TRADING_DAYS_PER_YEAR;
}
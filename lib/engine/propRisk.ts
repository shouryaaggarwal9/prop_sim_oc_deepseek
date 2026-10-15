import { PropAccount, ChallengeRuleConfig, ChallengePhase, AccountStatus, Position } from '../types';

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
    accountSize: 2500000,
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
  }
];

/**
 * Creates a new Prop Account
 */
export function createPropAccount(
  traderName: string,
  presetId: string = 'pro-10l',
  instantFunded: boolean = false
): PropAccount {
  const preset = DEFAULT_CHALLENGE_PRESETS.find((p) => p.id === presetId) || DEFAULT_CHALLENGE_PRESETS[1];
  const initial = preset.accountSize;
  const maxLossFloor = initial * (1 - preset.maxTrailingLossPct / 100);
  const dailyLossFloor = initial * (1 - preset.dailyLossPct / 100);

  return {
    id: 'ACC-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
    traderName: traderName || 'Trader One',
    ruleConfig: preset,
    phase: instantFunded ? 'FUNDED' : 'PHASE_1',
    status: 'ACTIVE',
    initialBalance: initial,
    currentBalance: initial,
    currentEquity: initial,
    highWaterMark: initial,
    startingDayEquity: initial,
    dailyLossFloor,
    maxLossFloor,
    tradingDays: 0,
    dailyPnLHistory: [],
    createdAt: new Date().toISOString(),
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
 * Real-time Prop Risk Monitor & Liquidation Guardian
 * Checks Daily Drawdown, Trailing High-Water Mark Drawdown, and Target Achievements
 */
export function evaluatePropRisk(
  account: PropAccount,
  unrealizedPnL: number,
  todayRealizedPnL: number = 0
): RiskEvaluationResult {
  if (account.status !== 'ACTIVE') {
    return { updatedAccount: account, hasBreached: account.status === 'FAILED', hasPassedPhase: false };
  }

  const currentEquity = account.currentBalance + unrealizedPnL;
  let highWaterMark = Math.max(account.highWaterMark, currentEquity);

  // Update Trailing High-Water Mark floor:
  // Standard Prop rule: As equity climbs, the floor trails up. Once floor reaches initial balance, it locks at initial balance.
  const trailingDistance = account.ruleConfig.accountSize * (account.ruleConfig.maxTrailingLossPct / 100);
  let maxLossFloor = Math.max(account.maxLossFloor, highWaterMark - trailingDistance);
  if (maxLossFloor > account.initialBalance) {
    maxLossFloor = account.initialBalance; // lock at break-even floor once in profit
  }

  // Daily Loss calculation: evaluated against startingDayEquity
  const dayPnl = currentEquity - account.startingDayEquity;
  const maxAllowedDailyLoss = account.startingDayEquity * (account.ruleConfig.dailyLossPct / 100);
  const dailyLossFloor = account.startingDayEquity - maxAllowedDailyLoss;

  const updatedAccount: PropAccount = {
    ...account,
    currentEquity,
    highWaterMark,
    maxLossFloor,
    dailyLossFloor,
  };

  // 1. Check Daily Loss Breach (Hard Breach)
  if (currentEquity <= dailyLossFloor) {
    updatedAccount.status = 'FAILED';
    updatedAccount.breachReason = `Daily Loss Limit Breached: Equity dropped by ₹${Math.abs(dayPnl).toLocaleString('en-IN')}, exceeding max allowed daily loss of ₹${maxAllowedDailyLoss.toLocaleString('en-IN')} (5%).`;
    return {
      updatedAccount,
      hasBreached: true,
      breachReason: updatedAccount.breachReason,
      hasPassedPhase: false,
    };
  }

  // 2. Check Trailing Maximum Drawdown Breach (Hard Breach)
  if (currentEquity <= maxLossFloor) {
    updatedAccount.status = 'FAILED';
    updatedAccount.breachReason = `Maximum Trailing Drawdown Breached: Equity dropped below high-water mark floor of ₹${maxLossFloor.toLocaleString('en-IN')}.`;
    return {
      updatedAccount,
      hasBreached: true,
      breachReason: updatedAccount.breachReason,
      hasPassedPhase: false,
    };
  }

  // 3. Check Profit Target (Only for evaluation phases)
  if (account.phase === 'PHASE_1' || account.phase === 'PHASE_2') {
    const targetPct = account.phase === 'PHASE_1' ? account.ruleConfig.phase1TargetPct : account.ruleConfig.phase2TargetPct;
    const targetAmount = account.ruleConfig.accountSize * (targetPct / 100);
    const totalProfit = currentEquity - account.initialBalance;

    if (totalProfit >= targetAmount && account.tradingDays >= account.ruleConfig.minTradingDays) {
      // Check consistency rule
      const maxSingleDayAllowed = targetAmount * (account.ruleConfig.maxSingleDayProfitPct / 100);
      const isConsistent = !account.dailyPnLHistory.some((d) => d.pnl > maxSingleDayAllowed);

      if (isConsistent) {
        if (account.phase === 'PHASE_1') {
          updatedAccount.phase = 'PHASE_2';
          updatedAccount.currentBalance = account.initialBalance; // reset balance to full size for phase 2
          updatedAccount.currentEquity = account.initialBalance;
          updatedAccount.highWaterMark = account.initialBalance;
          updatedAccount.startingDayEquity = account.initialBalance;
          return {
            updatedAccount,
            hasBreached: false,
            hasPassedPhase: true,
            nextPhase: 'PHASE_2',
          };
        } else if (account.phase === 'PHASE_2') {
          updatedAccount.phase = 'FUNDED';
          updatedAccount.status = 'PASSED';
          updatedAccount.passCertificateId = 'CERT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
          return {
            updatedAccount,
            hasBreached: false,
            hasPassedPhase: true,
            nextPhase: 'FUNDED',
          };
        }
      }
    }
  }

  return {
    updatedAccount,
    hasBreached: false,
    hasPassedPhase: false,
  };
}

/**
 * End of Day reconciliation
 */
export function rollOverTradingDay(account: PropAccount, dayRealizedPnl: number): PropAccount {
  const newBalance = account.currentBalance + dayRealizedPnl;
  const newDays = account.tradingDays + 1;
  const newHistory = [
    ...account.dailyPnLHistory,
    {
      date: new Date().toLocaleDateString('en-IN'),
      pnl: dayRealizedPnl,
      isPassed: dayRealizedPnl >= 0,
    },
  ];

  return {
    ...account,
    currentBalance: newBalance,
    currentEquity: newBalance,
    startingDayEquity: newBalance,
    tradingDays: newDays,
    dailyLossFloor: newBalance * (1 - account.ruleConfig.dailyLossPct / 100),
    dailyPnLHistory: newHistory,
  };
}

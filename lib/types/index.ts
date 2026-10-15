export type OptionType = 'CE' | 'PE';
export type OrderAction = 'BUY' | 'SELL';
export type UnderlyingSymbol = 'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'SENSEX';

export interface OptionLeg {
  id: string;
  underlying: UnderlyingSymbol;
  type: OptionType;
  action: OrderAction;
  strike: number;
  expiry: string;
  lots: number;
  lotSize: number;
  entryPrice: number;
  currentPrice: number;
  iv: number; // in percentage e.g. 15.5
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number; // in ₹ per day
  vega: number;  // in ₹ per 1% IV change
  rho: number;
}

export interface PayoffPoint {
  underlyingPrice: number;
  expiryPayoff: number;
  targetPayoff: number;
}

export interface StrategyPayoffSummary {
  payoffPoints: PayoffPoint[];
  maxProfit: number | 'UNLIMITED';
  maxLoss: number | 'UNLIMITED';
  riskRewardRatio: string;
  breakevens: number[];
  probabilityOfProfit: number; // e.g. 68.4%
  netGreeks: Greeks;
  totalCost: number;
  totalMarginEstimate: number;
}

export interface IndianCharges {
  stt: number;
  exchangeTurnover: number;
  sebiCharges: number;
  stampDuty: number;
  gst: number;
  brokerage: number;
  totalCharges: number;
}

export type ChallengePhase = 'PHASE_1' | 'PHASE_2' | 'FUNDED';
export type AccountStatus = 'ACTIVE' | 'PASSED' | 'FAILED';

export interface ChallengeRuleConfig {
  id: string;
  name: string;
  accountSize: number;
  phase1TargetPct: number; // e.g. 10%
  phase2TargetPct: number; // e.g. 5%
  dailyLossPct: number;    // e.g. 5%
  maxTrailingLossPct: number; // e.g. 10%
  minTradingDays: number;  // e.g. 3
  maxSingleDayProfitPct: number; // Consistency rule, e.g. 35%
  profitSplitPct: number;  // e.g. 80% for funded
}

export interface PropAccount {
  id: string;
  traderName: string;
  ruleConfig: ChallengeRuleConfig;
  phase: ChallengePhase;
  status: AccountStatus;
  initialBalance: number;
  currentBalance: number;
  currentEquity: number;
  highWaterMark: number;
  startingDayEquity: number;
  dailyLossFloor: number;
  maxLossFloor: number;
  tradingDays: number;
  dailyPnLHistory: { date: string; pnl: number; isPassed: boolean }[];
  breachReason?: string;
  passCertificateId?: string;
  createdAt: string;
  lastTradeDate?: string;
}

export interface Position {
  id: string;
  symbol: string;
  underlying: UnderlyingSymbol;
  type: OptionType;
  action: OrderAction;
  strike: number;
  expiry: string;
  lots: number;
  qty: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  charges: IndianCharges;
  openedAt: string;
}

export interface HistoricalBar {
  timestamp: string; // ISO string
  timeStr: string;   // e.g. '09:20'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ceLtp?: number;
  peLtp?: number;
}

export interface BacktestRule {
  strategyName: string;
  underlying: UnderlyingSymbol;
  entryTime: string; // '09:20'
  exitTime: string;  // '15:15'
  legs: {
    type: OptionType;
    action: OrderAction;
    strikeOffset: number; // 0 for ATM, 1 for ATM+1, -1 for ATM-1
    stopLossPct?: number; // e.g. 25%
    targetPct?: number;
    trailingSL?: { triggerPoints: number; trailPoints: number };
  }[];
  slippagePct: number; // e.g. 0.5%
}

export interface BacktestTradeLog {
  id: string;
  date: string;
  entryTime: string;
  exitTime: string;
  instrument: string;
  action: OrderAction;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  grossPnL: number;
  charges: number;
  netPnL: number;
  exitReason: 'STOP_LOSS' | 'TARGET' | 'TIME_EXIT' | 'SQUARE_OFF';
}

export interface BacktestResult {
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    grossProfit: number;
    totalCharges: number;
    netProfit: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    profitFactor: number;
    sharpeRatio: number;
    averageTradePnL: number;
  };
  dailyPnL: { date: string; grossPnL: number; netPnL: number; cumulativeEquity: number }[];
  tradeLogs: BacktestTradeLog[];
}

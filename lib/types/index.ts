export type OptionType = 'CE' | 'PE';
export type OrderAction = 'BUY' | 'SELL';
export type UnderlyingSymbol = 'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'SENSEX';

export interface InstrumentSpec {
  symbol: UnderlyingSymbol;
  /** Exchange display name. */
  label: string;
  /** Contracts per lot, as published by the exchange. */
  lotSize: number;
  /** Strike ladder increment. */
  strikeStep: number;
  /** Reference spot used by the offline simulator. */
  referenceSpot: number;
  /** Typical at-the-money implied volatility, in percent. */
  atmIv: number;
  /** Annualised dividend yield used in Black-Scholes, as a fraction. */
  dividendYield: number;
}

/**
 * Single source of truth for contract specifications.
 *
 * Exchange authorities revise lot sizes and strike ladders periodically, so these
 * values MUST be re-verified against the latest NSE/BSE circular before each
 * release. Every consumer (strategy builder, backtester, replay pad, tax engine)
 * reads from here rather than hard-coding its own ternaries.
 */
export const INSTRUMENTS: Record<UnderlyingSymbol, InstrumentSpec> = {
  NIFTY: {
    symbol: 'NIFTY',
    label: 'NIFTY 50',
    lotSize: 75,
    strikeStep: 50,
    referenceSpot: 25050,
    atmIv: 15,
    dividendYield: 0.012,
  },
  BANKNIFTY: {
    symbol: 'BANKNIFTY',
    label: 'NIFTY BANK',
    lotSize: 30,
    strikeStep: 100,
    referenceSpot: 51600,
    atmIv: 17,
    dividendYield: 0.013,
  },
  FINNIFTY: {
    symbol: 'FINNIFTY',
    label: 'NIFTY FIN SERVICE',
    lotSize: 65,
    strikeStep: 50,
    referenceSpot: 23400,
    atmIv: 16,
    dividendYield: 0.011,
  },
  SENSEX: {
    symbol: 'SENSEX',
    label: 'S&P BSE SENSEX',
    lotSize: 20,
    strikeStep: 100,
    referenceSpot: 81800,
    atmIv: 14,
    dividendYield: 0.012,
  },
};

export const UNDERLYING_SYMBOLS = Object.keys(INSTRUMENTS) as UnderlyingSymbol[];

/** Risk-free rate used for discounting (10-year G-Sec proxy). */
export const RISK_FREE_RATE = 0.068;

/** Trading days in a year, used to convert Black-Scholes year-fractions. */
export const TRADING_DAYS_PER_YEAR = 365;

export function getInstrument(symbol: UnderlyingSymbol): InstrumentSpec {
  return INSTRUMENTS[symbol];
}

/** Lot size for an underlying. Never silently falls back to a wrong value. */
export function getLotSize(symbol: UnderlyingSymbol): number {
  return INSTRUMENTS[symbol].lotSize;
}

/** Strike ladder increment for an underlying. */
export function getStrikeStep(symbol: UnderlyingSymbol): number {
  return INSTRUMENTS[symbol].strikeStep;
}

/** Nearest valid strike on the exchange ladder for the given spot. */
export function roundToStrike(spot: number, symbol: UnderlyingSymbol): number {
  const step = getStrikeStep(symbol);
  return Math.round(spot / step) * step;
}

/** Type guard so untrusted input (query strings, storage) never reaches engines. */
export function isUnderlyingSymbol(value: unknown): value is UnderlyingSymbol {
  return typeof value === 'string' && value in INSTRUMENTS;
}

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
  /** Implied volatility in percent, e.g. 15.5 */
  iv: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** Rupees per calendar day. */
  theta: number;
  /** Rupees per 1 percentage-point IV move. */
  vega: number;
  /** Rupees per 1 percentage-point rate move. */
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
  /** Percent, 0-100. */
  probabilityOfProfit: number;
  netGreeks: Greeks;
  /** Net debit (positive) or credit (negative) to open the structure. */
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
  /** e.g. 10 for a 10% phase-1 target. */
  phase1TargetPct: number;
  /** e.g. 5 for a 5% phase-2 target. */
  phase2TargetPct: number;
  /** e.g. 5 for 5% of the day's opening equity. */
  dailyLossPct: number;
  /** e.g. 10 for 10% trailing high-water-mark drawdown. */
  maxTrailingLossPct: number;
  minTradingDays: number;
  /** Consistency rule: no single day may exceed this share of the target, e.g. 35. */
  maxSingleDayProfitPct: number;
  /** Funded profit split, e.g. 80 for 80%. */
  profitSplitPct: number;
}

export interface DailyPnlRecord {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  pnl: number;
}

export interface PayoutRecord {
  id: string;
  date: string;
  amount: number;
  splitPct: number;
}

/** Why a leg was closed. Recorded on every ledger entry. */
export type TradeExitReason =
  | 'MANUAL'
  | 'SQUARE_OFF_ALL'
  | 'RISK_BREACH'
  | 'PAYOUT_FLATTEN'
  | 'REPLAY_EXIT';

/**
 * One closed leg, as booked into the balance.
 *
 * `realizedPnL` is copied verbatim from the marked position at the moment of
 * closing, so the ledger and `bookRealizedPnl` can never disagree about what a
 * trade was worth.
 */
export interface ClosedTrade {
  id: string;
  positionId: string;
  symbol: string;
  underlying: UnderlyingSymbol;
  type: OptionType;
  action: OrderAction;
  strike: number;
  expiry: string;
  lots: number;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnL: number;
  charges: IndianCharges;
  openedAt: string;
  closedAt: string;
  exitReason: TradeExitReason;
  /** Phase the account was in when this leg closed. */
  phase: ChallengePhase;
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
  /** Opening equity for the *current* trading day; resets on day rollover. */
  startingDayEquity: number;
  dailyLossFloor: number;
  maxLossFloor: number;
  tradingDays: number;
  dailyPnLHistory: DailyPnlRecord[];
  payouts: PayoutRecord[];
  /** Every closed leg, oldest first. Intentionally survives phase promotion. */
  closedTrades: ClosedTrade[];
  breachReason?: string;
  passCertificateId?: string;
  /** ISO date of the current trading session. */
  currentTradingDate: string;
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
  /**
   * Strike ladder offset from the at-the-money strike. Retained so a position
   * can be re-marked against the right contract as spot moves.
   */
  strikeOffset: number;
  expiry: string;
  lots: number;
  qty: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  /** Round-trip statutory cost estimate for this leg. */
  charges: IndianCharges;
  openedAt: string;
}

export interface HistoricalBar {
  /** ISO timestamp. */
  timestamp: string;
  /** Session time, e.g. '09:20'. */
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** At-the-money call premium, Black-Scholes consistent with `close`. */
  atmCePremium?: number;
  /** At-the-money put premium, Black-Scholes consistent with `close`. */
  atmPePremium?: number;
}

export interface TrailingStopConfig {
  /** Points of favourable move required before the stop arms. */
  triggerPoints: number;
  /** Points the stop trails behind the best price reached. */
  trailPoints: number;
}

export interface BacktestLegRule {
  type: OptionType;
  action: OrderAction;
  /** 0 = ATM, +2 = two strikes OTM on the call side, -2 on the put side. */
  strikeOffset: number;
  /** Stop-loss as a percent of entry premium. */
  stopLossPct?: number;
  /** Take-profit as a percent of entry premium. */
  targetPct?: number;
  trailingSL?: TrailingStopConfig;
}

export interface BacktestRule {
  strategyName: string;
  underlying: UnderlyingSymbol;
  /** Session time, 'HH:MM', 24-hour. */
  entryTime: string;
  /** Session time, 'HH:MM', 24-hour. */
  exitTime: string;
  legs: BacktestLegRule[];
  /** Adverse fill assumption applied to both entry and exit, in percent. */
  slippagePct: number;
}

export type ExitReason = 'STOP_LOSS' | 'TRAILING_STOP' | 'TARGET' | 'TIME_EXIT' | 'NO_BARS';

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
  exitReason: ExitReason;
}

export interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Percent, 0-100. */
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  totalCharges: number;
  netProfit: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  /** Gross win total / gross loss total. `null` when there are no losses. */
  profitFactor: number | null;
  /**
   * Annualised Sharpe computed from per-trade returns against a fixed notional.
   * `null` when it cannot be computed (fewer than 2 trades, or zero variance).
   */
  sharpeRatio: number | null;
  averageTradePnL: number;
  expectancyPoints: number;
}

export interface BacktestResult {
  summary: BacktestSummary;
  dailyPnL: { date: string; grossPnL: number; netPnL: number; cumulativeEquity: number }[];
  tradeLogs: BacktestTradeLog[];
  /** Non-fatal notes, e.g. sessions skipped because no bars matched the entry time. */
  warnings: string[];
}
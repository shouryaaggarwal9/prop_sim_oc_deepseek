import type {
  ChallengePhase,
  ClosedTrade,
  Position,
  PropAccount,
  TradeExitReason,
} from '../types';
import { bookRealizedPnl } from './propRisk';

/** Aggregate performance of a closed-trade ledger. */
export interface TradeLedgerSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Percent, 0-100. Break-even legs count against the win rate. */
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  /** Sum of realised P&L across the ledger — exactly what was booked. */
  realizedPnL: number;
  /** Gross profit / gross loss. `null` when there are no losing legs. */
  profitFactor: number | null;
  averageWin: number;
  averageLoss: number;
  /** Statutory cost estimate summed across the ledger. */
  totalCharges: number;
}

function tradeId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `TRD-${random.toUpperCase()}`;
}

/**
 * Snapshot a marked position as a ledger entry.
 *
 * `exitPrice` and `realizedPnL` are taken from the mark at the moment of
 * closing; nothing is recomputed later, so a trade's record never drifts from
 * the balance movement it caused.
 */
export function createClosedTrade(
  position: Position,
  reason: TradeExitReason,
  phase: ChallengePhase,
  closedAt: string
): ClosedTrade {
  return {
    id: tradeId(),
    positionId: position.id,
    symbol: position.symbol,
    underlying: position.underlying,
    type: position.type,
    action: position.action,
    strike: position.strike,
    expiry: position.expiry,
    lots: position.lots,
    qty: position.qty,
    entryPrice: position.entryPrice,
    exitPrice: position.currentPrice,
    realizedPnL: position.unrealizedPnL,
    charges: position.charges,
    openedAt: position.openedAt,
    closedAt,
    exitReason: reason,
    phase,
  };
}

/**
 * Close one or more legs: book their P&L into the balance and append them to
 * the ledger in a single, atomic step.
 *
 * Closing used to happen in five scattered places, which is exactly why the
 * records were lost. Every path that removes a position now goes through here,
 * so the ledger and the balance cannot fall out of step.
 *
 * Positions must already be marked (`currentPrice` / `unrealizedPnL` current).
 */
export function closePositions(
  account: PropAccount,
  positions: Position[],
  reason: TradeExitReason,
  closedAt: string = new Date().toISOString()
): { account: PropAccount; trades: ClosedTrade[] } {
  if (positions.length === 0) return { account, trades: [] };

  const trades = positions.map((p) => createClosedTrade(p, reason, account.phase, closedAt));
  const realized = trades.reduce((sum, t) => sum + t.realizedPnL, 0);

  // `bookRealizedPnl` is the only writer of the balance; the ledger records
  // what it booked. Both move together or the two disagree.
  const booked = bookRealizedPnl(account, realized);

  return {
    account: { ...booked, closedTrades: [...account.closedTrades, ...trades] },
    trades,
  };
}

/** Realised P&L booked on a given ISO calendar date, from the ledger itself. */
export function realisedPnlForDate(trades: ClosedTrade[], isoDate: string): number {
  return trades
    .filter((t) => t.closedAt.slice(0, 10) === isoDate)
    .reduce((sum, t) => sum + t.realizedPnL, 0);
}

export function summariseTradeLedger(trades: ClosedTrade[]): TradeLedgerSummary {
  const wins = trades.filter((t) => t.realizedPnL > 0);
  const losses = trades.filter((t) => t.realizedPnL < 0);

  const grossProfit = wins.reduce((sum, t) => sum + t.realizedPnL, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.realizedPnL, 0));
  const realizedPnL = trades.reduce((sum, t) => sum + t.realizedPnL, 0);

  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    grossProfit,
    grossLoss,
    realizedPnL,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageWin: wins.length > 0 ? grossProfit / wins.length : 0,
    averageLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    totalCharges: trades.reduce((sum, t) => sum + t.charges.totalCharges, 0),
  };
}

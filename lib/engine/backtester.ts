import {
  type BacktestLegRule,
  type BacktestResult,
  type BacktestRule,
  type BacktestSummary,
  type BacktestTradeLog,
  type ExitReason,
  type UnderlyingSymbol,
  getLotSize,
} from '../types';
import { calculateIndianCharges } from './indianTaxes';
import {
  PRESET_HISTORICAL_SESSIONS,
  type HistoricalSession,
  optionPremiumAtBar,
} from '../data/sampleHistoricalData';

/** Starting notional used to express per-trade returns for the Sharpe ratio. */
const DEFAULT_STARTING_EQUITY = 1000000;
const TRADING_DAYS_PER_YEAR_BACKTEST = 252;

/** `HH:MM` -> minutes from midnight, or null when malformed. */
export function parseClock(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface LegOutcome {
  exitPrice: number;
  exitTime: string;
  exitReason: ExitReason;
  entryPrice: number;
}

/**
 * Walk a single leg forward from its entry bar, applying the stop, the trailing
 * stop and the take-profit in intrabar order, then the scheduled time exit.
 *
 * Conservative ordering: when a bar could satisfy both a stop and a target,
 * the stop is assumed to fill first, because minute bars do not reveal the
 * intrabar path.
 */
function simulateLeg(
  leg: BacktestLegRule,
  session: HistoricalSession,
  entryIndex: number,
  entryPrice: number,
  exitMinutes: number
): LegOutcome {
  const isSell = leg.action === 'SELL';
  const priceAt = (index: number): number =>
    optionPremiumAtBar(session, index, leg.type, leg.strikeOffset).premium;

  // Stop and target are anchored to the slippage-adjusted entry price.
  const stopPrice =
    leg.stopLossPct && leg.stopLossPct > 0
      ? isSell
        ? entryPrice * (1 + leg.stopLossPct / 100)
        : entryPrice * (1 - leg.stopLossPct / 100)
      : null;

  const targetPrice =
    leg.targetPct && leg.targetPct > 0
      ? isSell
        ? entryPrice * (1 - leg.targetPct / 100)
        : entryPrice * (1 + leg.targetPct / 100)
      : null;

  // First bar at or after the requested exit time; the last bar if none match.
  let exitIndex = session.bars.length - 1;
  for (let i = entryIndex + 1; i < session.bars.length; i += 1) {
    const minutes = parseClock(session.bars[i]!.timeStr);
    if (minutes !== null && minutes >= exitMinutes) {
      exitIndex = i;
      break;
    }
  }

  let activeStop = stopPrice;
  let activeStopIsTrailing = false;
  let bestPrice = entryPrice;

  // Stops and targets are checked on bars strictly before the scheduled exit.
  for (let i = entryIndex + 1; i < exitIndex; i += 1) {
    const price = priceAt(i);

    // Ratchet the trailing stop, but only on favourable movement.
    const trailing = leg.trailingSL;
    if (trailing && trailing.triggerPoints > 0 && trailing.trailPoints > 0) {
      if (isSell ? price < bestPrice : price > bestPrice) {
        bestPrice = price;
      }
      const favourableMove = isSell ? entryPrice - bestPrice : bestPrice - entryPrice;

      if (favourableMove >= trailing.triggerPoints) {
        const newStop = isSell ? bestPrice + trailing.trailPoints : bestPrice - trailing.trailPoints;
        const tightens = activeStop === null || (isSell ? newStop < activeStop : newStop > activeStop);
        if (tightens) {
          activeStop = newStop;
          activeStopIsTrailing = true;
        }
      }
    }

    if (activeStop !== null) {
      const hit = isSell ? price >= activeStop : price <= activeStop;
      if (hit) {
        return {
          entryPrice,
          exitPrice: activeStop,
          exitTime: session.bars[i]!.timeStr,
          exitReason: activeStopIsTrailing ? 'TRAILING_STOP' : 'STOP_LOSS',
        };
      }
    }

    if (targetPrice !== null) {
      const hit = isSell ? price <= targetPrice : price >= targetPrice;
      if (hit) {
        return {
          entryPrice,
          exitPrice: targetPrice,
          exitTime: session.bars[i]!.timeStr,
          exitReason: 'TARGET',
        };
      }
    }
  }

  const exitBar = session.bars[exitIndex]!;
  return {
    entryPrice,
    exitPrice: priceAt(exitIndex),
    exitTime: exitBar.timeStr,
    exitReason: 'TIME_EXIT',
  };
}

export interface RunBacktestOptions {
  /** Restrict to specific session ids. Defaults to every session for the underlying. */
  sessionIds?: string[];
  /** Starting notional, used for equity curve and return-based metrics. */
  startingEquity?: number;
  brokeragePerOrder?: number;
}

/**
 * Event-driven backtester over one-minute expiry sessions.
 *
 * Option premiums are priced with Black-Scholes at each bar against that bar's
 * spot and the time remaining in the session, so a strike offset genuinely
 * trades an out-of-the-money contract rather than silently reusing the ATM one.
 */
export function runBacktest(
  rule: BacktestRule,
  options: RunBacktestOptions = {}
): BacktestResult {
  const {
    sessionIds,
    startingEquity = DEFAULT_STARTING_EQUITY,
    brokeragePerOrder = 20,
  } = options;

  const warnings: string[] = [];
  const tradeLogs: BacktestTradeLog[] = [];
  const dailyPnL: BacktestResult['dailyPnL'] = [];

  const selectedSessions =
    sessionIds && sessionIds.length > 0
      ? PRESET_HISTORICAL_SESSIONS.filter((s) => sessionIds.includes(s.id))
      : PRESET_HISTORICAL_SESSIONS.filter((s) => s.underlying === rule.underlying);

  if (selectedSessions.length === 0) {
    warnings.push('No historical sessions matched the selected underlying.');
  }

  const entryMinutes = parseClock(rule.entryTime);
  const exitMinutes = parseClock(rule.exitTime);

  if (entryMinutes === null) {
    warnings.push(`Entry time "${rule.entryTime}" is not a valid HH:MM value; no trades were taken.`);
    return emptyResult(warnings, startingEquity);
  }
  if (exitMinutes === null) {
    warnings.push(`Exit time "${rule.exitTime}" is not a valid HH:MM value; no trades were taken.`);
    return emptyResult(warnings, startingEquity);
  }
  if (exitMinutes <= entryMinutes) {
    warnings.push(
      `Exit time ${rule.exitTime} must be later than entry time ${rule.entryTime}; no trades were taken.`
    );
    return emptyResult(warnings, startingEquity);
  }

  const qty = getLotSize(rule.underlying);
  let cumulativeEquity = startingEquity;

  for (const session of selectedSessions) {
    const entryIndex = session.bars.findIndex((bar) => {
      const m = parseClock(bar.timeStr);
      return m !== null && m >= entryMinutes;
    });

    if (entryIndex === -1) {
      warnings.push(`${session.date}: entry time ${rule.entryTime} falls outside the session; skipped.`);
      continue;
    }

    let dayGrossPnL = 0;
    let dayTotalCharges = 0;

    rule.legs.forEach((leg, legIndex) => {
      const baseEntry = optionPremiumAtBar(session, entryIndex, leg.type, leg.strikeOffset);
      const entryPrice = applySlippage(baseEntry.premium, leg.action, rule.slippagePct);
      const outcome = simulateLeg(leg, session, entryIndex, entryPrice, exitMinutes);

      const exitPrice = applySlippage(
        outcome.exitPrice,
        leg.action === 'BUY' ? 'SELL' : 'BUY',
        rule.slippagePct
      );

      const pointsDiff =
        leg.action === 'SELL' ? entryPrice - exitPrice : exitPrice - entryPrice;
      const grossPnL = Math.round(pointsDiff * qty);

      const entryCharges = calculateIndianCharges({
        action: leg.action,
        price: entryPrice,
        qty,
        brokeragePerOrder,
      });
      const exitCharges = calculateIndianCharges({
        action: leg.action === 'BUY' ? 'SELL' : 'BUY',
        price: exitPrice,
        qty,
        brokeragePerOrder,
      });
      const legCharges = entryCharges.totalCharges + exitCharges.totalCharges;
      const netPnL = grossPnL - legCharges;

      dayGrossPnL += grossPnL;
      dayTotalCharges += legCharges;

      tradeLogs.push({
        id: `TR-${session.id}-${leg.type}-${leg.strikeOffset}-${legIndex}`,
        date: session.date,
        entryTime: rule.entryTime,
        exitTime: outcome.exitTime,
        instrument: describeInstrument(rule.underlying, leg, baseEntry.strike),
        action: leg.action,
        entryPrice,
        exitPrice,
        qty,
        grossPnL,
        charges: Number(legCharges.toFixed(2)),
        netPnL,
        exitReason: outcome.exitReason,
      });
    });

    const dayNetPnL = dayGrossPnL - dayTotalCharges;
    cumulativeEquity += dayNetPnL;
    dailyPnL.push({
      date: session.date,
      grossPnL: dayGrossPnL,
      netPnL: dayNetPnL,
      cumulativeEquity: Math.round(cumulativeEquity),
    });
  }

  if (tradeLogs.length === 0 && warnings.length === 0) {
    warnings.push('The rule matched no tradable legs across the selected sessions.');
  }

  return {
    summary: summarise(tradeLogs, dailyPnL, startingEquity),
    dailyPnL,
    tradeLogs,
    warnings,
  };
}

function describeInstrument(
  underlying: UnderlyingSymbol,
  leg: BacktestLegRule,
  strike: number
): string {
  const offsetLabel =
    leg.strikeOffset === 0 ? 'ATM' : `${Math.abs(leg.strikeOffset)}x OTM`;
  return `${underlying} ${strike} ${leg.type} (${offsetLabel})`;
}

function applySlippage(price: number, action: 'BUY' | 'SELL', slippagePct: number): number {
  const slip = Number.isFinite(slippagePct) ? Math.max(0, slippagePct) : 0;
  const factor = action === 'BUY' ? 1 + slip / 100 : 1 - slip / 100;
  return Number((price * factor).toFixed(2));
}

function emptyResult(warnings: string[], startingEquity: number): BacktestResult {
  return {
    summary: summarise([], [], startingEquity),
    dailyPnL: [],
    tradeLogs: [],
    warnings,
  };
}

function summarise(
  tradeLogs: BacktestTradeLog[],
  dailyPnL: BacktestResult['dailyPnL'],
  startingEquity: number
): BacktestSummary {
  const totalTrades = tradeLogs.length;
  const winningTrades = tradeLogs.filter((t) => t.netPnL > 0).length;
  const losingTrades = totalTrades - winningTrades;

  const grossProfit = tradeLogs.reduce((acc, t) => acc + Math.max(0, t.grossPnL), 0);
  const grossLoss = Math.abs(tradeLogs.reduce((acc, t) => acc + Math.min(0, t.grossPnL), 0));
  const totalCharges = tradeLogs.reduce((acc, t) => acc + t.charges, 0);
  const netProfit = tradeLogs.reduce((acc, t) => acc + t.netPnL, 0);

  const { maxDrawdown, maxDrawdownPct } = measureDrawdown(dailyPnL, startingEquity);

  const sharpeRatio = computeSharpe(tradeLogs, startingEquity);

  const averageTradePnL = totalTrades > 0 ? netProfit / totalTrades : 0;
  const qty = tradeLogs[0]?.qty ?? 0;
  const expectancyPoints =
    qty > 0 && totalTrades > 0
      ? tradeLogs.reduce((acc, t) => acc + (t.exitPrice - t.entryPrice) * (t.action === 'SELL' ? -1 : 1), 0) /
        totalTrades
      : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0,
    grossProfit,
    grossLoss,
    totalCharges: Math.round(totalCharges),
    netProfit,
    maxDrawdown,
    maxDrawdownPct,
    profitFactor:
      grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? null : 0,
    sharpeRatio,
    averageTradePnL: Math.round(averageTradePnL),
    expectancyPoints: Number(expectancyPoints.toFixed(2)),
  };
}

/**
 * Peak-to-trough decline of the equity curve, measured on session closes.
 * Intra-session drawdown is not observable from session-close equity alone and
 * is therefore reported separately by the replay engine.
 */
function measureDrawdown(
  dailyPnL: BacktestResult['dailyPnL'],
  startingEquity: number
): { maxDrawdown: number; maxDrawdownPct: number } {
  let peak = startingEquity;
  let maxDrawdown = 0;

  for (const day of dailyPnL) {
    if (day.cumulativeEquity > peak) peak = day.cumulativeEquity;
    const dd = peak - day.cumulativeEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    maxDrawdown,
    maxDrawdownPct: peak > 0 ? Number(((maxDrawdown / peak) * 100).toFixed(2)) : 0,
  };
}

/**
 * Annualised Sharpe ratio computed from per-trade returns against the starting
 * notional.
 *
 * Returns `null` — never a fabricated number — when there are fewer than two
 * trades or when the return series has no dispersion.
 */
export function computeSharpe(
  tradeLogs: BacktestTradeLog[],
  startingEquity: number
): number | null {
  if (tradeLogs.length < 2 || startingEquity <= 0) return null;

  const returns = tradeLogs.map((t) => t.netPnL / startingEquity);
  const mean = returns.reduce((acc, r) => acc + r, 0) / returns.length;

  const variance =
    returns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return null;

  return Number(((mean / stdDev) * Math.sqrt(TRADING_DAYS_PER_YEAR_BACKTEST)).toFixed(2));
}
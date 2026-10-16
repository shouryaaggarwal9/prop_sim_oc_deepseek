'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Play, Receipt, Settings, TrendingUp } from 'lucide-react';
import type { BacktestResult, BacktestRule, UnderlyingSymbol } from '@/lib/types';
import { UNDERLYING_SYMBOLS, getInstrument } from '@/lib/types';
import { parseClock, runBacktest } from '@/lib/engine/backtester';
import { cn, formatINR } from '@/lib/utils';

type PresetKey = '920_STRADDLE' | '920_STRANGLE';

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Sessions available for a given underlying, so the UI can say so plainly. */
function sessionsFor(underlying: UnderlyingSymbol): number {
  return underlying === 'SENSEX' || underlying === 'FINNIFTY' ? 0 : 1;
}

function buildRule(
  preset: PresetKey,
  underlying: UnderlyingSymbol,
  entryTime: string,
  exitTime: string,
  stopLossPct: number,
  targetPct: number | null,
  enableTrailing: boolean,
  slippagePct: number
): BacktestRule {
  const legs =
    preset === '920_STRADDLE'
      ? ([0, 0] as const).map((offset, index) => ({
          type: index === 0 ? ('CE' as const) : ('PE' as const),
          action: 'SELL' as const,
          strikeOffset: offset,
          stopLossPct,
          ...(targetPct ? { targetPct } : {}),
          ...(enableTrailing ? { trailingSL: { triggerPoints: 30, trailPoints: 15 } } : {}),
        }))
      : ([2, -2] as const).map((offset, index) => ({
          type: index === 0 ? ('CE' as const) : ('PE' as const),
          action: 'SELL' as const,
          strikeOffset: offset,
          stopLossPct,
          ...(targetPct ? { targetPct } : {}),
          ...(enableTrailing ? { trailingSL: { triggerPoints: 20, trailPoints: 10 } } : {}),
        }));

  return {
    strategyName: preset === '920_STRADDLE' ? '9:20 Short Straddle' : '9:20 OTM Short Strangle',
    underlying,
    entryTime,
    exitTime,
    legs,
    slippagePct,
  };
}

export function BacktesterView() {
  const [underlying, setUnderlying] = useState<UnderlyingSymbol>('NIFTY');
  const [preset, setPreset] = useState<PresetKey>('920_STRADDLE');
  const [entryTime, setEntryTime] = useState('09:20');
  const [exitTime, setExitTime] = useState('15:15');
  const [stopLossPct, setStopLossPct] = useState(25);
  const [targetPct, setTargetPct] = useState<number | null>(null);
  const [enableTrailing, setEnableTrailing] = useState(true);
  const [slippagePct, setSlippagePct] = useState(0.5);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const instrument = getInstrument(underlying);
  const sessionCount = sessionsFor(underlying);
  const hasNoSessions = sessionCount === 0;

  // Validate the times before running so a typo explains itself instead of
  // silently producing an empty trade log.
  const timeErrors = useMemo(() => {
    const errors: string[] = [];
    if (!TIME_PATTERN.test(entryTime) || parseClock(entryTime) === null) {
      errors.push(`Entry time "${entryTime}" is not a valid HH:MM time.`);
    }
    if (!TIME_PATTERN.test(exitTime) || parseClock(exitTime) === null) {
      errors.push(`Exit time "${exitTime}" is not a valid HH:MM time.`);
    }
    const entry = parseClock(entryTime);
    const exit = parseClock(exitTime);
    if (entry !== null && exit !== null && exit <= entry) {
      errors.push('Exit time must be later than entry time.');
    }
    return errors;
  }, [entryTime, exitTime]);

  const handleRun = () => {
    if (timeErrors.length > 0 || hasNoSessions) return;
    setResult(
      runBacktest(
        buildRule(
          preset,
          underlying,
          entryTime,
          exitTime,
          stopLossPct,
          targetPct,
          enableTrailing,
          slippagePct
        )
      )
    );
  };

  const canRun = timeErrors.length === 0 && !hasNoSessions;

  return (
    <div className="space-y-6">
      <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
              Algo Strategy Configuration
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            1-minute expiry sessions • {sessionCount || 'no'} tape{hasNoSessions ? 's' : ''} available
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label htmlFor="bt-preset" className="text-[11px] text-slate-400 block mb-1">
              Strategy Type
            </label>
            <select
              id="bt-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetKey)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value="920_STRADDLE">9:20 ATM Short Straddle</option>
              <option value="920_STRANGLE">9:20 OTM Short Strangle</option>
            </select>
          </div>

          <div>
            <label htmlFor="bt-underlying" className="text-[11px] text-slate-400 block mb-1">
              Index
            </label>
            <select
              id="bt-underlying"
              value={underlying}
              onChange={(e) => setUnderlying(e.target.value as UnderlyingSymbol)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              {UNDERLYING_SYMBOLS.map((s) => (
                <option key={s} value={s} disabled={sessionsFor(s) === 0}>
                  {getInstrument(s).label} (Lot {getInstrument(s).lotSize})
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 block mb-1">Entry / Exit</span>
            <div className="flex items-center gap-1">
              <label htmlFor="bt-entry" className="sr-only">
                Entry time
              </label>
              <input
                id="bt-entry"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                aria-invalid={timeErrors.length > 0}
                className={cn(
                  'w-full px-2 py-1.5 rounded-lg bg-slate-950 border text-white text-center font-mono text-xs',
                  timeErrors.length > 0 ? 'border-rose-500' : 'border-slate-800'
                )}
              />
              <span className="text-slate-500">-</span>
              <label htmlFor="bt-exit" className="sr-only">
                Exit time
              </label>
              <input
                id="bt-exit"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={exitTime}
                onChange={(e) => setExitTime(e.target.value)}
                aria-invalid={timeErrors.length > 0}
                className={cn(
                  'w-full px-2 py-1.5 rounded-lg bg-slate-950 border text-white text-center font-mono text-xs',
                  timeErrors.length > 0 ? 'border-rose-500' : 'border-slate-800'
                )}
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Run Backtest</span>
            </button>
          </div>

          <div>
            <label htmlFor="bt-sl" className="text-[11px] text-slate-400 block mb-1">
              Leg Stop Loss (%)
            </label>
            <input
              id="bt-sl"
              type="number"
              min={0}
              max={100}
              value={stopLossPct}
              onChange={(e) => setStopLossPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div>
            <label htmlFor="bt-tp" className="text-[11px] text-slate-400 block mb-1">
              Take Profit (%) — optional
            </label>
            <input
              id="bt-tp"
              type="number"
              min={0}
              max={100}
              value={targetPct ?? ''}
              placeholder="none"
              onChange={(e) =>
                setTargetPct(e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div>
            <label htmlFor="bt-slip" className="text-[11px] text-slate-400 block mb-1">
              Slippage (%)
            </label>
            <input
              id="bt-slip"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={slippagePct}
              onChange={(e) => setSlippagePct(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300 h-8">
              <input
                type="checkbox"
                checked={enableTrailing}
                onChange={(e) => setEnableTrailing(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span>Lock &amp; Trail</span>
            </label>
          </div>
        </div>

        {timeErrors.length > 0 ? (
          <ul role="alert" className="space-y-1">
            {timeErrors.map((error) => (
              <li key={error} className="flex items-start gap-1.5 text-[11px] text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                {error}
              </li>
            ))}
          </ul>
        ) : null}

        {hasNoSessions ? (
          <p role="alert" className="flex items-start gap-1.5 text-[11px] text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            No bundled expiry session exists for {instrument.label}. Only NIFTY and BANKNIFTY tapes ship
            with the app.
          </p>
        ) : null}
      </section>

      {result ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Net P&L (post-tax)" value={formatINR(result.summary.netProfit, true)} tone={result.summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'} hint={`Gross ${formatINR(result.summary.grossProfit)}`} />
            <Kpi label="Win Rate" value={`${result.summary.winRate}%`} tone="text-cyan-400" hint={`${result.summary.winningTrades}W / ${result.summary.losingTrades}L`} />
            <Kpi
              label="Profit Factor"
              value={result.summary.profitFactor === null ? 'No losses' : String(result.summary.profitFactor)}
              tone="text-white"
              hint="Gross basis"
            />
            <Kpi
              label="Sharpe Ratio"
              value={result.summary.sharpeRatio === null ? 'n/a' : String(result.summary.sharpeRatio)}
              tone={result.summary.sharpeRatio === null ? 'text-slate-500' : 'text-white'}
              hint={result.summary.sharpeRatio === null ? 'Needs 2+ varied trades' : 'Annualised, trade returns'}
            />
            <Kpi label="Max Drawdown" value={formatINR(result.summary.maxDrawdown)} tone="text-rose-400" hint={`${result.summary.maxDrawdownPct}% of peak, session close`} />
            <Kpi label="Statutory Costs" value={formatINR(result.summary.totalCharges)} tone="text-amber-400" hint="STT, GST, exchange, SEBI" />
          </div>

          {result.warnings.length > 0 ? (
            <ul role="status" className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
              {result.warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-[11px] text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                  {w}
                </li>
              ))}
            </ul>
          ) : null}

          {result.dailyPnL.length > 0 ? (
            <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span className="font-semibold text-white">Cumulative Equity</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  End equity {formatINR(result.dailyPnL[result.dailyPnL.length - 1]!.cumulativeEquity)}
                </span>
              </div>

              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.dailyPnL} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                      formatter={(v) => [formatINR(Number(v)), 'Equity']}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulativeEquity"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#equityGrad)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {result.tradeLogs.length > 0 ? (
            <section className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                  <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
                    Trade Execution Log
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">{result.tradeLogs.length} legs</span>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Per-leg execution log with exit reason</caption>
                  <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                    <tr>
                      <th scope="col" className="py-2 px-3">Date</th>
                      <th scope="col" className="py-2 px-3">Instrument</th>
                      <th scope="col" className="py-2 px-3">Action</th>
                      <th scope="col" className="py-2 px-3">Entry</th>
                      <th scope="col" className="py-2 px-3">Exit</th>
                      <th scope="col" className="py-2 px-3">Exit Reason</th>
                      <th scope="col" className="py-2 px-3">Costs</th>
                      <th scope="col" className="py-2 px-3 text-right">Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {result.tradeLogs.map((trade) => (
                      <tr key={trade.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-400 font-sans">{trade.date}</td>
                        <td className="py-2 px-3 text-slate-200 font-sans">{trade.instrument}</td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-bold',
                              trade.action === 'BUY'
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            )}
                          >
                            {trade.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {trade.entryTime} @ ₹{trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {trade.exitTime} @ ₹{trade.exitPrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <ExitBadge reason={trade.exitReason} netPnL={trade.netPnL} />
                        </td>
                        <td className="py-2 px-3 text-amber-400/80">₹{trade.charges.toFixed(2)}</td>
                        <td
                          className={cn(
                            'py-2 px-3 text-right font-bold',
                            trade.netPnL > 0 ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {formatINR(trade.netPnL, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-500">
          Configure the strategy and run a backtest to see results.
        </p>
      )}
    </div>
  );
}

/** Trailing exits are labelled distinctly from hard stops. */
function ExitBadge({ reason, netPnL }: { reason: string; netPnL: number }) {
  const tone =
    reason === 'STOP_LOSS'
      ? 'bg-rose-500/20 text-rose-300'
      : reason === 'TRAILING_STOP'
        ? netPnL >= 0
          ? 'bg-emerald-500/20 text-emerald-300'
          : 'bg-rose-500/20 text-rose-300'
        : 'bg-slate-700/40 text-slate-300';

  return <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', tone)}>{reason.replace(/_/g, ' ')}</span>;
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
      <span className="text-[11px] text-slate-400 block">{label}</span>
      <span className={cn('text-base font-bold font-mono', tone)}>{value}</span>
      <span className="text-[10px] text-slate-500 block mt-0.5">{hint}</span>
    </div>
  );
}
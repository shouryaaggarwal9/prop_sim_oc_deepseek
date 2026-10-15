'use client';

import React, { useState } from 'react';
import { BacktestRule, BacktestResult, UnderlyingSymbol } from '@/lib/types';
import { runBacktest } from '@/lib/engine/backtester';
import { formatINR } from '@/lib/utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  Play,
  RotateCcw,
  TrendingUp,
  Percent,
  Receipt,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
} from 'lucide-react';

export const BacktesterView: React.FC = () => {
  const [underlying, setUnderlying] = useState<UnderlyingSymbol>('NIFTY');
  const [strategyPreset, setStrategyPreset] = useState<'920_STRADDLE' | '920_STRANGLE'>('920_STRADDLE');
  const [entryTime, setEntryTime] = useState<string>('09:20');
  const [exitTime, setExitTime] = useState<string>('15:15');
  const [stopLossPct, setStopLossPct] = useState<number>(25);
  const [enableTrailing, setEnableTrailing] = useState<boolean>(true);
  const [slippagePct, setSlippagePct] = useState<number>(0.5);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<BacktestResult | null>(() => {
    // Run initial backtest immediately
    return runBacktest({
      strategyName: '9:20 Short Straddle',
      underlying: 'NIFTY',
      entryTime: '09:20',
      exitTime: '15:15',
      legs: [
        { type: 'CE', action: 'SELL', strikeOffset: 0, stopLossPct: 25, trailingSL: { triggerPoints: 30, trailPoints: 15 } },
        { type: 'PE', action: 'SELL', strikeOffset: 0, stopLossPct: 25, trailingSL: { triggerPoints: 30, trailPoints: 15 } },
      ],
      slippagePct: 0.5,
    });
  });

  const handleRunBacktest = () => {
    setIsRunning(true);
    setTimeout(() => {
      const legs =
        strategyPreset === '920_STRADDLE'
          ? [
              {
                type: 'CE' as const,
                action: 'SELL' as const,
                strikeOffset: 0,
                stopLossPct,
                trailingSL: enableTrailing ? { triggerPoints: 30, trailPoints: 15 } : undefined,
              },
              {
                type: 'PE' as const,
                action: 'SELL' as const,
                strikeOffset: 0,
                stopLossPct,
                trailingSL: enableTrailing ? { triggerPoints: 30, trailPoints: 15 } : undefined,
              },
            ]
          : [
              {
                type: 'CE' as const,
                action: 'SELL' as const,
                strikeOffset: 2,
                stopLossPct,
                trailingSL: enableTrailing ? { triggerPoints: 20, trailPoints: 10 } : undefined,
              },
              {
                type: 'PE' as const,
                action: 'SELL' as const,
                strikeOffset: -2,
                stopLossPct,
                trailingSL: enableTrailing ? { triggerPoints: 20, trailPoints: 10 } : undefined,
              },
            ];

      const res = runBacktest({
        strategyName: strategyPreset === '920_STRADDLE' ? '9:20 Short Straddle' : '9:20 Short Strangle',
        underlying,
        entryTime,
        exitTime,
        legs,
        slippagePct,
      });

      setResult(res);
      setIsRunning(false);
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Strategy Configuration Form */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
              Algo Strategy Configuration (AlgoTest / StockMock Model)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">1-Minute Intraday Replay Engine</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          {/* Preset */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Strategy Type</label>
            <select
              value={strategyPreset}
              onChange={(e) => setStrategyPreset(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value="920_STRADDLE">9:20 ATM Short Straddle</option>
              <option value="920_STRANGLE">9:20 OTM Short Strangle</option>
            </select>
          </div>

          {/* Underlying */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Index</label>
            <select
              value={underlying}
              onChange={(e) => setUnderlying(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value="NIFTY">NIFTY 50 (Lot 50)</option>
              <option value="BANKNIFTY">BANK NIFTY (Lot 15)</option>
            </select>
          </div>

          {/* Entry & Exit */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Entry / Exit Time</label>
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                className="w-1/2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center font-mono text-xs"
              />
              <span className="text-slate-500">-</span>
              <input
                type="text"
                value={exitTime}
                onChange={(e) => setExitTime(e.target.value)}
                className="w-1/2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-center font-mono text-xs"
              />
            </div>
          </div>

          {/* Stop Loss */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Leg Stop Loss (%)</label>
            <input
              type="number"
              value={stopLossPct}
              onChange={(e) => setStopLossPct(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          {/* Trailing SL */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Trailing SL</label>
            <div className="flex items-center h-8">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={enableTrailing}
                  onChange={(e) => setEnableTrailing(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <span>Lock & Trail (+30/+15)</span>
              </label>
            </div>
          </div>

          {/* Run Button */}
          <div className="flex items-end">
            <button
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="w-full h-8 flex items-center justify-center space-x-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunning ? 'Simulating...' : 'Run Backtest'}</span>
            </button>
          </div>
        </div>
      </div>

      {result && (
        <>
          {/* Performance KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Net P&L (Post-Tax)</span>
              <span
                className={`text-base font-bold font-mono ${
                  result.summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatINR(result.summary.netProfit, true)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Gross: {formatINR(result.summary.grossProfit)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Win Rate</span>
              <span className="text-base font-bold font-mono text-cyan-400">{result.summary.winRate}%</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {result.summary.winningTrades}W / {result.summary.losingTrades}L
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Profit Factor</span>
              <span className="text-base font-bold font-mono text-white">{result.summary.profitFactor}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Sharpe ~{result.summary.sharpeRatio}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Max Drawdown</span>
              <span className="text-base font-bold font-mono text-rose-400">
                {formatINR(result.summary.maxDrawdown)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{result.summary.maxDrawdownPct}% of equity</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Indian Taxes & Charges</span>
              <span className="text-base font-bold font-mono text-amber-400">
                {formatINR(result.summary.totalCharges)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">STT, GST, Exch, SEBI</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Avg Trade P&L</span>
              <span className="text-base font-bold font-mono text-slate-200">
                {formatINR(result.summary.averageTradePnL, true)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{result.summary.totalTrades} total legs</span>
            </div>
          </div>

          {/* Equity Curve Chart */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white">Cumulative Equity Curve (1-Min Replay)</span>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">
                End Equity: {formatINR(result.dailyPnL[result.dailyPnL.length - 1]?.cumulativeEquity || 1000000)}
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
                    tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                    formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, 'Equity']}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeEquity"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#equityGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trade-By-Trade Audit Log */}
          <div className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
                  Detailed Trade Execution Log
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">{result.tradeLogs.length} Legs Executed</span>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Instrument</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Entry Time/Price</th>
                    <th className="py-2 px-3">Exit Time/Price</th>
                    <th className="py-2 px-3">Exit Reason</th>
                    <th className="py-2 px-3">Taxes</th>
                    <th className="py-2 px-3 text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {result.tradeLogs.map((trade) => {
                    const isWin = trade.netPnL > 0;
                    return (
                      <tr key={trade.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-400 font-sans">{trade.date}</td>
                        <td className="py-2 px-3 text-slate-200 font-sans">{trade.instrument}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
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
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              trade.exitReason === 'STOP_LOSS'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {trade.exitReason.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-amber-400/80">₹{trade.charges.toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatINR(trade.netPnL, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

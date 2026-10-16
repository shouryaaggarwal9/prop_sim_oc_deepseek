'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BookOpen } from 'lucide-react';
import type { ClosedTrade, DailyPnlRecord, TradeExitReason } from '@/lib/types';
import { cn, formatINR } from '@/lib/utils';
import { summariseTradeLedger } from '@/lib/engine/tradeLedger';

interface TradeLedgerProps {
  trades: ClosedTrade[];
  dailyPnLHistory: DailyPnlRecord[];
}

const REASON_LABEL: Record<TradeExitReason, string> = {
  MANUAL: 'Manual exit',
  SQUARE_OFF_ALL: 'Square off all',
  RISK_BREACH: 'Risk breach',
  PAYOUT_FLATTEN: 'Payout flatten',
  REPLAY_EXIT: 'Replay exit',
};

/**
 * Fixed to Asia/Kolkata and created once, so the server and the browser render
 * identical strings and hydration cannot mismatch.
 */
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});
const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
});

/** Compact axis labels; sub-thousand values stay as plain rupees. */
function formatAxis(value: number): string {
  return Math.abs(value) >= 1000 ? `${Math.round(value / 100) / 10}k` : `${Math.round(value)}`;
}

export function TradeLedger({ trades, dailyPnLHistory }: TradeLedgerProps) {
  const summary = useMemo(() => summariseTradeLedger(trades), [trades]);
  // Newest first: the most recent close is what a trader looks for.
  const rows = useMemo(() => [...trades].reverse(), [trades]);

  if (trades.length === 0 && dailyPnLHistory.length === 0) {
    return (
      <section className="rounded-xl bg-slate-900/80 border border-slate-800 p-8 text-center">
        <BookOpen className="w-6 h-6 text-slate-600 mx-auto mb-2" aria-hidden="true" />
        <p className="text-xs font-medium text-slate-400">The trade ledger is empty</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Every leg you close is recorded here with its entry, exit and realised P&amp;L.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <LedgerStat label="Closed Legs">
          <span className="text-lg font-bold font-mono text-white">{summary.totalTrades}</span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {summary.winningTrades}W / {summary.losingTrades}L
          </p>
        </LedgerStat>

        <LedgerStat label="Win Rate">
          <span className="text-lg font-bold font-mono text-white">
            {summary.winRate.toFixed(0)}%
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">of closed legs</p>
        </LedgerStat>

        <LedgerStat label="Realised P&L">
          <span
            className={cn(
              'text-lg font-bold font-mono',
              summary.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            )}
          >
            {formatINR(summary.realizedPnL, true)}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">booked into balance</p>
        </LedgerStat>

        <LedgerStat label="Profit Factor">
          <span className="text-lg font-bold font-mono text-white">
            {summary.profitFactor === null ? '—' : summary.profitFactor.toFixed(2)}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {summary.profitFactor === null ? 'no losing leg yet' : 'gross win / gross loss'}
          </p>
        </LedgerStat>

        <LedgerStat label="Charges (est.)">
          <span className="text-lg font-bold font-mono text-white">
            {formatINR(summary.totalCharges)}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">statutory, round trip</p>
        </LedgerStat>
      </section>

      {dailyPnLHistory.length > 0 ? (
        <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-2 text-xs">
            <h4 className="font-semibold text-white">Daily Realised P&amp;L</h4>
            <span className="text-slate-400 font-mono text-[11px]">
              {dailyPnLHistory.length} closed {dailyPnLHistory.length === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="h-52 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPnLHistory} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  // Anchor at zero so profit and loss days are comparable, and a
                  // single data point cannot collapse every tick to one label.
                  domain={[
                    (dataMin: number) => Math.min(0, dataMin),
                    (dataMax: number) => Math.max(0, dataMax),
                  ]}
                  tickFormatter={formatAxis}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d16',
                    borderColor: '#334155',
                    borderRadius: '8px',
                  }}
                  formatter={(v) => [formatINR(Number(v), true), 'Day P&L']}
                />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {dailyPnLHistory.map((day) => (
                    <Cell key={day.date} fill={day.pnl >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white">Trade Ledger</h3>
          <span className="text-[11px] text-slate-400">Most recent first</span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Closed option legs with realised profit and loss</caption>
            <thead className="bg-slate-950/40 text-slate-400 border-b border-slate-800 sticky top-0">
              <tr>
                <th scope="col" className="py-2.5 px-4 font-medium">Closed</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Instrument</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Side</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Qty</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Entry → Exit</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Realised P&amp;L</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {rows.map((trade) => {
                const isProfit = trade.realizedPnL >= 0;
                const opened = new Date(trade.closedAt);
                return (
                  <tr key={trade.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                      {dateFmt.format(opened)}{' '}
                      <span className="text-slate-500">{timeFmt.format(opened)}</span>
                    </td>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      {trade.underlying} {trade.strike} {trade.type}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold',
                          trade.action === 'BUY'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        )}
                      >
                        {trade.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {trade.qty} ({trade.lots})
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                      ₹{trade.entryPrice.toFixed(2)} → ₹{trade.exitPrice.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        'py-2.5 px-4 font-bold',
                        isProfit ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {formatINR(trade.realizedPnL, true)}
                    </td>
                    <td className="py-2.5 px-4 font-sans">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap',
                          trade.exitReason === 'RISK_BREACH'
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                        )}
                      >
                        {REASON_LABEL[trade.exitReason]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LedgerStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      {children}
    </div>
  );
}

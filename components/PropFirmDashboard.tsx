'use client';

import { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  ShieldAlert,
  Award,
  DollarSign,
  TrendingUp,
  AlertOctagon,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  CalendarCheck,
  XCircle,
  Info,
} from 'lucide-react';
import type { Position, PropAccount } from '@/lib/types';
import { cn, formatINR } from '@/lib/utils';
import { targetForPhase, violatesConsistencyRule } from '@/lib/engine/propRisk';
import { Modal } from '@/components/ui/Modal';

interface PropFirmDashboardProps {
  account: PropAccount;
  positions: Position[];
  withdrawable: number;
  /** Synthetic spot the open book is being marked against. */
  spot: number;
  spotUnderlying: string;
  onSquareOffPosition: (positionId: string) => void;
  onSquareOffAll: () => void;
  onResetAccount: () => void;
  onEndTradingDay: () => void;
  onRequestPayout: (amount: number) => void;
}

export function PropFirmDashboard({
  account,
  positions,
  withdrawable,
  spot,
  spotUnderlying,
  onSquareOffPosition,
  onSquareOffAll,
  onResetAccount,
  onEndTradingDay,
  onRequestPayout,
}: PropFirmDashboardProps) {
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutRequested, setPayoutRequested] = useState(false);

  const initial = account.initialBalance;
  const equity = account.currentEquity;
  const balance = account.currentBalance;
  const highWaterMark = account.highWaterMark;
  const totalPnL = equity - initial;
  const isProfit = totalPnL >= 0;
  const isFunded = account.phase === 'FUNDED';

  const targetAmount = targetForPhase(account);
  const targetProgress =
    targetAmount > 0 ? Math.min(100, Math.max(0, (totalPnL / targetAmount) * 100)) : 0;

  const dayPnl = equity - account.startingDayEquity;
  const maxDailyLossAllowed = account.startingDayEquity * (account.ruleConfig.dailyLossPct / 100);
  const dailyLossUsedPct = Math.min(
    100,
    Math.max(0, dayPnl < 0 ? (Math.abs(dayPnl) / Math.max(1, maxDailyLossAllowed)) * 100 : 0)
  );
  const dailyCushion = Math.max(
    0,
    maxDailyLossAllowed - (dayPnl < 0 ? Math.abs(dayPnl) : 0)
  );

  const trailingDistance = account.ruleConfig.accountSize * (account.ruleConfig.maxTrailingLossPct / 100);
  const drawdownFromHwm = Math.max(0, highWaterMark - equity);
  const trailingDdUsedPct = Math.min(100, (drawdownFromHwm / Math.max(1, trailingDistance)) * 100);

  const consistencyBreached = violatesConsistencyRule(account);
  const daysSatisfied = account.tradingDays >= account.ruleConfig.minTradingDays;

  const handlePayoutSubmit = () => {
    const split = withdrawable * (account.ruleConfig.profitSplitPct / 100);
    onRequestPayout(split);
    setPayoutRequested(true);
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    window.setTimeout(() => {
      setIsPayoutOpen(false);
      setPayoutRequested(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {account.status === 'FAILED' && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-950/50 border border-rose-600/60 text-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl"
        >
          <div className="flex items-start space-x-3">
            <AlertOctagon className="w-8 h-8 text-rose-400 shrink-0" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-base text-white">Challenge Account Breached</h3>
              <p className="text-xs text-rose-300 mt-0.5">{account.breachReason}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onResetAccount}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg transition"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Reset &amp; Retake Challenge</span>
          </button>
        </div>
      )}

      {(account.status === 'PASSED' || isFunded) && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start space-x-3">
            <Award className="w-8 h-8 text-emerald-400 shrink-0" aria-hidden="true" />
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="font-bold text-base text-white">
                  {isFunded ? 'Simulated Funded Account Active' : 'Phase Evaluation Passed'}
                </h3>
                {account.passCertificateId ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                    {account.passCertificateId}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-emerald-300 mt-0.5">
                {isFunded
                  ? `Trading simulated capital. Eligible for a ${account.ruleConfig.profitSplitPct}% simulated profit split.`
                  : 'All evaluation risk parameters and profit targets have been met. Start the next phase to continue.'}
              </p>
            </div>
          </div>
          {isFunded ? (
            <button
              type="button"
              onClick={() => setIsPayoutOpen(true)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition"
            >
              <DollarSign className="w-4 h-4" aria-hidden="true" />
              <span>Simulated Payout Desk</span>
            </button>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Current Equity" sub={`Bal: ${formatINR(balance)}`}>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">{formatINR(equity)}</span>
            <span
              className={cn(
                'text-xs font-semibold flex items-center',
                isProfit ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              {isProfit ? (
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {formatINR(totalPnL, true)}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-slate-400 flex justify-between border-t border-slate-800/80 pt-2">
            <span>High-Water Mark</span>
            <span className="font-mono text-slate-200">{formatINR(highWaterMark)}</span>
          </p>
        </MetricCard>

        {/* Funded accounts have no profit target, so the card shows withdrawable
            profit instead of a meaningless "N/A left to target" gauge. */}
        {isFunded ? (
          <MetricCard label={`Withdrawable Profit (${account.ruleConfig.profitSplitPct}% split)`}>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
              {formatINR(withdrawable)}
            </div>
            <p className="mt-3 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
              Net profit{' '}
              <span className="font-mono text-slate-200">{formatINR(Math.max(0, balance - initial))}</span>
            </p>
          </MetricCard>
        ) : (
          <MetricCard
            label={`Profit Target (${account.phase === 'PHASE_1' ? account.ruleConfig.phase1TargetPct : account.ruleConfig.phase2TargetPct}%)`}
            sub={`${targetProgress.toFixed(1)}%`}
          >
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              {formatINR(Math.max(0, targetAmount - totalPnL))}
              <span className="text-xs text-slate-400 font-normal ml-1.5">left to target</span>
            </div>
            <ProgressBar value={targetProgress} tone="bg-emerald-500" />
          </MetricCard>
        )}

        <MetricCard
          label={`Max Daily Loss (${account.ruleConfig.dailyLossPct}%)`}
          sub={`${dailyLossUsedPct.toFixed(1)}% used`}
          subTone={dailyLossUsedPct > 70 ? 'text-rose-400' : 'text-slate-300'}
        >
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {formatINR(dailyCushion)}
            <span className="text-xs text-slate-400 font-normal ml-1.5">cushion remaining</span>
          </div>
          <ProgressBar
            value={dailyLossUsedPct}
            tone={riskTone(dailyLossUsedPct)}
          />
        </MetricCard>

        <MetricCard
          label={`Max Trailing Drawdown (${account.ruleConfig.maxTrailingLossPct}%)`}
          sub={`${trailingDdUsedPct.toFixed(1)}% used`}
          subTone={trailingDdUsedPct > 70 ? 'text-rose-400' : 'text-slate-300'}
        >
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {formatINR(account.maxLossFloor)}
            <span className="text-xs text-slate-400 font-normal ml-1.5">liquidation floor</span>
          </div>
          <ProgressBar value={trailingDdUsedPct} tone={riskTone(trailingDdUsedPct)} />
        </MetricCard>
      </div>

      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Challenge Objectives &amp; Consistency Audit
          </h4>
          <button
            type="button"
            onClick={onEndTradingDay}
            disabled={account.status === 'FAILED'}
            title="Book today's P&L, count the trading day and reset the daily loss anchor"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>End Trading Day</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <AuditItem
            satisfied={daysSatisfied}
            Icon={Calendar}
            label="Trading Days"
            value={`${account.tradingDays} / ${account.ruleConfig.minTradingDays} days`}
          />
          <AuditItem
            satisfied={equity > account.dailyLossFloor}
            Icon={ShieldAlert}
            label="Daily Loss"
            value={`${formatINR(maxDailyLossAllowed)} max`}
          />
          <AuditItem
            satisfied={equity > account.maxLossFloor}
            Icon={TrendingUp}
            label="Trailing DD"
            value={`${account.ruleConfig.maxTrailingLossPct}% trailing HWM`}
          />
          {/* Reflects real history: an empty log means "not yet evaluable",
              never a green tick implying compliance. */}
          <AuditItem
            satisfied={account.dailyPnLHistory.length > 0 && !consistencyBreached}
            indeterminate={account.dailyPnLHistory.length === 0}
            Icon={account.dailyPnLHistory.length > 0 && consistencyBreached ? XCircle : CheckCircle2}
            label="Consistency Rule"
            value={
              account.dailyPnLHistory.length === 0
                ? 'awaiting closed days'
                : `<${account.ruleConfig.maxSingleDayProfitPct}% max day win`
            }
          />
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <h3 className="font-semibold text-sm text-white">
              Live Open Positions ({positions.length})
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-mono" aria-live="off">
              {spotUnderlying} spot ₹{spot.toLocaleString('en-IN')} · synthetic
            </span>
            {positions.length > 0 ? (
              <button
                type="button"
                onClick={onSquareOffAll}
                className="px-3 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-medium text-xs transition"
              >
                Square Off All
              </button>
            ) : null}
          </div>
        </div>

        {positions.length === 0 ? (
          <p className="py-12 text-center text-slate-500 text-xs">
            No open positions. Build a strategy or use Market Replay to create simulated option legs.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Open option positions with mark-to-market P&amp;L</caption>
              <thead className="bg-slate-950/40 text-slate-400 border-b border-slate-800">
                <tr>
                  <th scope="col" className="py-2.5 px-4 font-medium">Instrument</th>
                  <th scope="col" className="py-2.5 px-4 font-medium">Action</th>
                  <th scope="col" className="py-2.5 px-4 font-medium">Qty (Lots)</th>
                  <th scope="col" className="py-2.5 px-4 font-medium">Entry</th>
                  <th scope="col" className="py-2.5 px-4 font-medium">LTP</th>
                  <th scope="col" className="py-2.5 px-4 font-medium">MTM P&amp;L</th>
                  <th scope="col" className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {positions.map((pos) => {
                  const isPosProfit = pos.unrealizedPnL >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                        {pos.underlying} {pos.strike} {pos.type}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold',
                            pos.action === 'BUY'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          )}
                        >
                          {pos.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {pos.qty} ({pos.lots})
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">₹{pos.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-slate-200">₹{pos.currentPrice.toFixed(2)}</td>
                      <td className={cn('py-2.5 px-4 font-bold', isPosProfit ? 'text-emerald-400' : 'text-rose-400')}>
                        {formatINR(pos.unrealizedPnL, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => onSquareOffPosition(pos.id)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition"
                        >
                          Exit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isPayoutOpen}
        onClose={() => setIsPayoutOpen(false)}
        title="Simulated Profit Withdrawal Desk"
        description="As a funded trader you may withdraw your simulated profit share. No real funds are involved."
        className="max-w-md"
        footer={
          payoutRequested ? undefined : (
            <>
              <button
                type="button"
                onClick={() => setIsPayoutOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={withdrawable <= 0}
                onClick={handlePayoutSubmit}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Request Payout
              </button>
            </>
          )
        }
      >
        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
          <Row label="Account Net Profit" value={formatINR(Math.max(0, balance - initial))} />
          <Row label="Profit Split Ratio" value={`${account.ruleConfig.profitSplitPct}%`} tone="text-emerald-400" />
          <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
            <span className="text-slate-200">Simulated Payout</span>
            <span className="text-emerald-400">
              {formatINR(withdrawable * (account.ruleConfig.profitSplitPct / 100))}
            </span>
          </div>
        </div>

        {withdrawable <= 0 ? (
          <p className="flex items-start gap-2 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            No profit is available to withdraw yet. Close positions above the opening balance first.
          </p>
        ) : null}

        {payoutRequested ? (
          <p
            role="status"
            className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-center text-xs text-emerald-300 font-semibold"
          >
            Payout processed into the simulated wallet.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

function riskTone(usedPct: number): string {
  if (usedPct > 80) return 'bg-rose-500';
  if (usedPct > 50) return 'bg-amber-500';
  return 'bg-cyan-500';
}

function MetricCard({
  label,
  sub,
  subTone = 'text-emerald-400 font-semibold',
  children,
}: {
  label: string;
  sub?: string;
  subTone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
      <div className="flex justify-between items-center text-xs text-slate-400">
        <span>{label}</span>
        {sub ? <span className={subTone}>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${value}%` }} />
    </div>
  );
}

function AuditItem({
  satisfied,
  indeterminate = false,
  Icon,
  label,
  value,
}: {
  satisfied: boolean;
  indeterminate?: boolean;
  Icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  const tone = indeterminate
    ? 'bg-slate-800 text-slate-400'
    : satisfied
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-rose-500/20 text-rose-400';

  return (
    <div className="flex items-center space-x-2.5">
      <div className={cn('h-6 w-6 rounded-full flex items-center justify-center shrink-0', tone)}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <span className="text-slate-400">{label}: </span>
        <span className="font-semibold text-white break-words">{value}</span>
      </div>
    </div>
  );
}

function Row({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between text-slate-400">
      <span>{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}
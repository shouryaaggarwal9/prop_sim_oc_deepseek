'use client';

import React, { useState } from 'react';
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
  Sparkles,
} from 'lucide-react';
import { PropAccount, Position } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface PropFirmDashboardProps {
  account: PropAccount;
  positions: Position[];
  onSquareOffPosition: (positionId: string) => void;
  onSquareOffAll: () => void;
  onResetAccount: () => void;
  onRequestPayout: (amount: number) => void;
}

export const PropFirmDashboard: React.FC<PropFirmDashboardProps> = ({
  account,
  positions,
  onSquareOffPosition,
  onSquareOffAll,
  onResetAccount,
  onRequestPayout,
}) => {
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutRequested, setPayoutRequested] = useState(false);

  const initial = account.initialBalance;
  const equity = account.currentEquity;
  const balance = account.currentBalance;
  const highWaterMark = account.highWaterMark;
  const totalPnL = equity - initial;
  const isProfit = totalPnL >= 0;

  // Profit Target
  const targetPct =
    account.phase === 'PHASE_1'
      ? account.ruleConfig.phase1TargetPct
      : account.phase === 'PHASE_2'
      ? account.ruleConfig.phase2TargetPct
      : 0;
  const targetAmount = initial * (targetPct / 100);
  const targetProgress = targetAmount > 0 ? Math.min(100, Math.max(0, (totalPnL / targetAmount) * 100)) : 100;

  // Daily Loss
  const dayPnl = equity - account.startingDayEquity;
  const maxDailyLossAllowed = account.startingDayEquity * (account.ruleConfig.dailyLossPct / 100);
  const dailyLossUsedPct = Math.min(
    100,
    Math.max(0, dayPnl < 0 ? (Math.abs(dayPnl) / maxDailyLossAllowed) * 100 : 0)
  );

  // Trailing Drawdown
  const trailingDistance = initial * (account.ruleConfig.maxTrailingLossPct / 100);
  const currentDdFromHwm = Math.max(0, highWaterMark - equity);
  const trailingDdUsedPct = Math.min(100, (currentDdFromHwm / trailingDistance) * 100);

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handlePayoutSubmit = () => {
    const profit = Math.max(0, balance - initial);
    const split = profit * (account.ruleConfig.profitSplitPct / 100);
    onRequestPayout(split);
    setPayoutRequested(true);
    triggerConfetti();
    setTimeout(() => {
      setShowPayoutModal(false);
      setPayoutRequested(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Breach Warning Banner */}
      {account.status === 'FAILED' && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-600/60 text-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center space-x-3">
            <AlertOctagon className="w-8 h-8 text-rose-400 shrink-0" />
            <div>
              <h3 className="font-bold text-base text-white">Challenge Account Breached (Hard Breach)</h3>
              <p className="text-xs text-rose-300 mt-0.5">{account.breachReason}</p>
            </div>
          </div>
          <button
            onClick={onResetAccount}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset & Retake Challenge</span>
          </button>
        </div>
      )}

      {/* Passing / Funded Congratulation Banner */}
      {(account.status === 'PASSED' || account.phase === 'FUNDED') && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center space-x-3">
            <Award className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-white">
                  {account.phase === 'FUNDED' ? 'Simulated Funded Account Active' : 'Phase Evaluation Passed!'}
                </h3>
                {account.passCertificateId && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                    {account.passCertificateId}
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-300 mt-0.5">
                {account.phase === 'FUNDED'
                  ? `You are trading simulated capital. Eligible for ${account.ruleConfig.profitSplitPct}% simulated profit split payouts.`
                  : 'Congratulations! All evaluation risk parameters and profit targets have been met.'}
              </p>
            </div>
          </div>
          {account.phase === 'FUNDED' && (
            <button
              onClick={() => setShowPayoutModal(true)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition"
            >
              <DollarSign className="w-4 h-4" />
              <span>Simulated Payout Desk</span>
            </button>
          )}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Balance & Equity */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Current Equity</span>
            <span className="text-slate-500 font-mono">Bal: {formatINR(balance)}</span>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-white">{formatINR(equity)}</span>
            <span
              className={`text-xs font-semibold flex items-center ${
                isProfit ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {formatINR(totalPnL, true)}
            </span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex justify-between border-t border-slate-800/80 pt-2">
            <span>High-Water Mark:</span>
            <span className="font-mono text-slate-200">{formatINR(highWaterMark)}</span>
          </div>
        </div>

        {/* Card 2: Profit Target Gauge */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Profit Target ({targetPct}%)</span>
            <span className="text-emerald-400 font-semibold">{targetProgress.toFixed(1)}%</span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {targetAmount > 0 ? formatINR(Math.max(0, targetAmount - totalPnL)) : 'N/A'}
            <span className="text-xs text-slate-400 font-normal ml-1.5">left to target</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${targetProgress}%` }}
            />
          </div>
        </div>

        {/* Card 3: Daily Drawdown Limit */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Max Daily Loss ({account.ruleConfig.dailyLossPct}%)</span>
            <span className={`font-semibold ${dailyLossUsedPct > 70 ? 'text-rose-400' : 'text-slate-300'}`}>
              {dailyLossUsedPct.toFixed(1)}% used
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {formatINR(Math.max(0, maxDailyLossAllowed - (dayPnl < 0 ? Math.abs(dayPnl) : 0)))}
            <span className="text-xs text-slate-400 font-normal ml-1.5">cushion remaining</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dailyLossUsedPct > 80 ? 'bg-rose-500' : dailyLossUsedPct > 50 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${dailyLossUsedPct}%` }}
            />
          </div>
        </div>

        {/* Card 4: Trailing High-Water Mark Loss */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Max Trailing Drawdown ({account.ruleConfig.maxTrailingLossPct}%)</span>
            <span className={`font-semibold ${trailingDdUsedPct > 70 ? 'text-rose-400' : 'text-slate-300'}`}>
              {trailingDdUsedPct.toFixed(1)}% used
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {formatINR(account.maxLossFloor)}
            <span className="text-xs text-slate-400 font-normal ml-1.5">liquidation floor</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                trailingDdUsedPct > 80 ? 'bg-rose-500' : trailingDdUsedPct > 50 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${trailingDdUsedPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Rules & Consistency Checklist */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Challenge Objectives & Consistency Audit
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center space-x-2.5">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center ${
                account.tradingDays >= account.ruleConfig.minTradingDays
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-slate-400">Trading Days: </span>
              <span className="font-semibold text-white">
                {account.tradingDays} / {account.ruleConfig.minTradingDays} days
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center ${
                equity > account.dailyLossFloor ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-slate-400">Daily Loss: </span>
              <span className="font-semibold text-white">₹{formatINR(maxDailyLossAllowed)} max</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center ${
                equity > account.maxLossFloor ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-slate-400">Trailing DD: </span>
              <span className="font-semibold text-white">{account.ruleConfig.maxTrailingLossPct}% trailing HWM</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-slate-400">Consistency Rule: </span>
              <span className="font-semibold text-white">&lt;{account.ruleConfig.maxSingleDayProfitPct}% max day win</span>
            </div>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">Live Open Positions ({positions.length})</h3>
          </div>
          {positions.length > 0 && (
            <button
              onClick={onSquareOffAll}
              className="px-3 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-medium text-xs transition"
            >
              Square Off All
            </button>
          )}
        </div>

        {positions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No open positions currently. Go to <span className="text-emerald-400 font-medium">Strategy Builder</span> or{' '}
            <span className="text-emerald-400 font-medium">Market Replay</span> to execute simulated option legs.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/40 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Instrument</th>
                  <th className="py-2.5 px-4 font-medium">Action</th>
                  <th className="py-2.5 px-4 font-medium">Qty (Lots)</th>
                  <th className="py-2.5 px-4 font-medium">Entry Price</th>
                  <th className="py-2.5 px-4 font-medium">LTP</th>
                  <th className="py-2.5 px-4 font-medium">MTM P&L</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {positions.map((pos) => {
                  const pnl = pos.unrealizedPnL;
                  const isPosProfit = pnl >= 0;

                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                        {pos.underlying} {pos.strike} {pos.type}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pos.action === 'BUY'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {pos.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {pos.qty} ({pos.lots} lots)
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">₹{pos.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-slate-200">₹{pos.currentPrice.toFixed(2)}</td>
                      <td className={`py-2.5 px-4 font-bold ${isPosProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatINR(pnl, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-sans">
                        <button
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

      {/* Payout Desk Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-emerald-400">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-bold text-base text-white">Simulated Profit Withdrawal Desk</h3>
            </div>
            <p className="text-xs text-slate-300">
              As a funded trader, you are eligible to withdraw your simulated profit share.
            </p>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Account Net Profit:</span>
                <span className="text-white">{formatINR(Math.max(0, balance - initial))}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Profit Split Ratio:</span>
                <span className="text-emerald-400 font-semibold">{account.ruleConfig.profitSplitPct}%</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                <span className="text-slate-200">Simulated Payout:</span>
                <span className="text-emerald-400">
                  {formatINR(Math.max(0, balance - initial) * (account.ruleConfig.profitSplitPct / 100))}
                </span>
              </div>
            </div>

            {payoutRequested ? (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-center text-xs text-emerald-300 font-semibold">
                ✓ Payout processed successfully into simulated wallet!
              </div>
            ) : (
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setShowPayoutModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={balance <= initial}
                  onClick={handlePayoutSubmit}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 disabled:opacity-50"
                >
                  Request Payout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

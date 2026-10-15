'use client';

import React from 'react';
import { Shield, BarChart3, PlayCircle, History, Calculator, UserCheck, AlertTriangle } from 'lucide-react';
import { PropAccount } from '@/lib/types';
import { formatINR } from '@/lib/utils';

interface NavbarProps {
  activeTab: 'PROP' | 'STRATEGY' | 'BACKTEST' | 'REPLAY' | 'TAXES';
  setActiveTab: (tab: 'PROP' | 'STRATEGY' | 'BACKTEST' | 'REPLAY' | 'TAXES') => void;
  account: PropAccount;
  onNewAccount: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  account,
  onNewAccount,
}) => {
  const isFailed = account.status === 'FAILED';
  const isPassed = account.status === 'PASSED';

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-emerald-500/20">
            QP
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">QuantProp</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                INDIA F&O
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Self-Hosted Prop Challenge & Strategy Simulator</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('PROP')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'PROP'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Prop Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('STRATEGY')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'STRATEGY'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Strategy Builder</span>
          </button>

          <button
            onClick={() => setActiveTab('BACKTEST')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'BACKTEST'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Algo Backtester</span>
          </button>

          <button
            onClick={() => setActiveTab('REPLAY')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'REPLAY'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Market Replay</span>
          </button>

          <button
            onClick={() => setActiveTab('TAXES')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'TAXES'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Taxes & Charges</span>
          </button>
        </nav>

        {/* Account Status Pill */}
        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200 flex items-center justify-end space-x-1.5">
              <span>{account.ruleConfig.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  isFailed
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : isPassed || account.phase === 'FUNDED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                }`}
              >
                {account.phase.replace('_', ' ')}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Equity: <span className="font-mono font-medium text-emerald-400">{formatINR(account.currentEquity)}</span>
            </div>
          </div>

          <button
            onClick={onNewAccount}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Switch Account
          </button>
        </div>
      </div>
    </header>
  );
};

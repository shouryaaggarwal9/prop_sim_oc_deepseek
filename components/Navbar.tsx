'use client';

import React from 'react';
import { Shield, BarChart3, PlayCircle, History, Calculator, type LucideIcon } from 'lucide-react';
import type { PropAccount } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type AppTab = 'PROP' | 'STRATEGY' | 'BACKTEST' | 'REPLAY' | 'TAXES';

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  account: PropAccount;
  onNewAccount: () => void;
}

const TABS: { id: AppTab; label: string; Icon: LucideIcon }[] = [
  { id: 'PROP', label: 'Prop Terminal', Icon: Shield },
  { id: 'STRATEGY', label: 'Strategy Builder', Icon: BarChart3 },
  { id: 'BACKTEST', label: 'Algo Backtester', Icon: History },
  { id: 'REPLAY', label: 'Market Replay', Icon: PlayCircle },
  { id: 'TAXES', label: 'Taxes & Charges', Icon: Calculator },
];

export function Navbar({ activeTab, setActiveTab, account, onNewAccount }: NavbarProps) {
  const isFailed = account.status === 'FAILED';
  const isFunded = account.phase === 'FUNDED';

  const statusTone = isFailed
    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    : isFunded || account.status === 'PASSED'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3 shrink-0">
          <div
            aria-hidden="true"
            className="h-10 w-10 rounded-lg bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-emerald-500/20"
          >
            QP
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">QuantProp</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                INDIA F&amp;O
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-slate-400">
              Self-Hosted Prop Challenge &amp; Strategy Simulator
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition',
                activeTab === id
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              )}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">{label}</span>
              <span className="md:hidden">{label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden lg:block">
            <div className="text-xs font-semibold text-slate-200 flex items-center justify-end gap-1.5">
              <span className="max-w-40 truncate">{account.ruleConfig.name}</span>
              <span className={cn('text-[10px] px-1.5 py-0.2 rounded font-bold', statusTone)}>
                {account.phase.replace('_', ' ')}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Equity:{' '}
              <span className="font-mono font-medium text-emerald-400">
                {formatINR(account.currentEquity)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onNewAccount}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Switch Account
          </button>
        </div>
      </div>
    </header>
  );
}
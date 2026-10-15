'use client';

import React, { useState } from 'react';
import { DEFAULT_CHALLENGE_PRESETS } from '@/lib/engine/propRisk';
import { PropAccount } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import { Shield, Check, X } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (traderName: string, presetId: string, instantFunded: boolean) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
}) => {
  const [traderName, setTraderName] = useState<string>('Quant Trader');
  const [selectedId, setSelectedId] = useState<string>('pro-10l');

  if (!isOpen) return null;

  const handleStart = () => {
    const isInstant = selectedId === 'funded-direct-10l';
    onSelectPreset(traderName, selectedId, isInstant);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-white">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base">Select Prop Evaluation Challenge</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs text-slate-300 block mb-1.5 font-medium">Trader Name / Handle</label>
          <input
            type="text"
            value={traderName}
            onChange={(e) => setTraderName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
            placeholder="e.g. Rahul Sharma"
          />
        </div>

        <div className="space-y-2.5">
          <label className="text-xs text-slate-300 block font-medium">Select Evaluation Tier</label>
          {DEFAULT_CHALLENGE_PRESETS.map((preset) => {
            const isSelected = selectedId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => setSelectedId(preset.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-white">{preset.name}</span>
                    {preset.id === 'funded-direct-10l' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        INSTANT
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex space-x-3">
                    <span>Target: {preset.phase1TargetPct}%</span>
                    <span>Daily Max: {preset.dailyLossPct}%</span>
                    <span>Trailing Max: {preset.maxTrailingLossPct}%</span>
                    <span>Split: {preset.profitSplitPct}%</span>
                  </div>
                </div>

                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                    isSelected ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg transition"
          >
            Start Challenge
          </button>
        </div>
      </div>
    </div>
  );
};

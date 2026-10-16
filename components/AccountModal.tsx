'use client';

import { useState } from 'react';
import { Check, Shield } from 'lucide-react';
import { DEFAULT_CHALLENGE_PRESETS } from '@/lib/engine/propRisk';
import { Modal } from '@/components/ui/Modal';
import { cn, formatINR } from '@/lib/utils';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (traderName: string, presetId: string, instantFunded: boolean) => void;
}

export function AccountModal({ isOpen, onClose, onSelectPreset }: AccountModalProps) {
  const [traderName, setTraderName] = useState('Quant Trader');
  const [selectedId, setSelectedId] = useState('pro-10l');

  const handleStart = () => {
    onSelectPreset(traderName, selectedId, selectedId === 'funded-direct-10l');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Prop Evaluation Challenge"
      description="Simulation only — no real capital, broker connection or order routing is involved."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg transition"
          >
            Start Challenge
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="trader-name" className="text-xs text-slate-300 block mb-1.5 font-medium">
          Trader Name / Handle
        </label>
        <input
          id="trader-name"
          type="text"
          value={traderName}
          onChange={(e) => setTraderName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
          placeholder="e.g. Rahul Sharma"
        />
      </div>

      <fieldset className="space-y-2.5">
        <legend className="text-xs text-slate-300 font-medium mb-1.5">Evaluation Tier</legend>
        {DEFAULT_CHALLENGE_PRESETS.map((preset) => {
          const isSelected = selectedId === preset.id;
          return (
            <div
              key={preset.id}
              onClick={() => setSelectedId(preset.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedId(preset.id);
                }
              }}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={cn(
                'p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3',
                isSelected
                  ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-md'
                  : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800/40'
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-white">{preset.name}</span>
                  {preset.phase1TargetPct === 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      INSTANT
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
                  <span>Size {formatINR(preset.accountSize)}</span>
                  <span>Target {preset.phase1TargetPct}%</span>
                  <span>Daily {preset.dailyLossPct}%</span>
                  <span>Trailing {preset.maxTrailingLossPct}%</span>
                  <span>Split {preset.profitSplitPct}%</span>
                  <span>Min {preset.minTradingDays} days</span>
                </p>
              </div>

              <div
                aria-hidden="true"
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center border shrink-0',
                  isSelected ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700'
                )}
              >
                {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
              </div>
            </div>
          );
        })}
      </fieldset>

      <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
        <Shield className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
        Rules are modelled on published two-phase prop firm structures but are illustrative, not a
        representation of any specific firm.
      </p>
    </Modal>
  );
}
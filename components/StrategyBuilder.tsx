'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  UnderlyingSymbol,
  OptionLeg,
  OptionType,
  OrderAction,
  Position,
} from '@/lib/types';
import { calculateStrategyPayoff } from '@/lib/engine/strategySimulator';
import { calculateBSPrice, calculateGreeks } from '@/lib/engine/blackScholes';
import { calculateIndianCharges } from '@/lib/engine/indianTaxes';
import { formatINR } from '@/lib/utils';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import {
  Plus,
  Trash2,
  Sliders,
  Send,
  Sparkles,
  Info,
  TrendingUp,
  Activity,
  ChevronDown,
  Layers,
} from 'lucide-react';

interface StrategyBuilderProps {
  onDeployStrategy: (newPositions: Position[]) => void;
}

export const StrategyBuilder: React.FC<StrategyBuilderProps> = ({ onDeployStrategy }) => {
  const [underlying, setUnderlying] = useState<UnderlyingSymbol>('NIFTY');
  const [spotPrice, setSpotPrice] = useState<number>(25050);
  const [daysToExpiry, setDaysToExpiry] = useState<number>(4);
  const [targetDays, setTargetDays] = useState<number>(4);
  const [targetIvShift, setTargetIvShift] = useState<number>(0);
  const [targetSpotPrice, setTargetSpotPrice] = useState<number>(25050);
  const [showOptionChain, setShowOptionChain] = useState<boolean>(false);
  const [deploySuccess, setDeploySuccess] = useState<boolean>(false);

  const lotSize = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 15 : 40;
  const strikeStep = underlying === 'BANKNIFTY' ? 100 : 50;

  // Initialize with a default Short Strangle or Iron Condor
  const [legs, setLegs] = useState<OptionLeg[]>([
    {
      id: 'leg-1',
      underlying: 'NIFTY',
      type: 'CE',
      action: 'SELL',
      strike: 25250,
      expiry: '24-OCT-2024',
      lots: 1,
      lotSize: 50,
      entryPrice: 85,
      currentPrice: 85,
      iv: 14.5,
    },
    {
      id: 'leg-2',
      underlying: 'NIFTY',
      type: 'PE',
      action: 'SELL',
      strike: 24850,
      expiry: '24-OCT-2024',
      lots: 1,
      lotSize: 50,
      entryPrice: 90,
      currentPrice: 90,
      iv: 15.2,
    },
  ]);

  // Adjust spot when underlying changes
  useEffect(() => {
    let newSpot = 25050;
    if (underlying === 'BANKNIFTY') newSpot = 51600;
    if (underlying === 'FINNIFTY') newSpot = 23400;
    if (underlying === 'SENSEX') newSpot = 81800;

    setSpotPrice(newSpot);
    setTargetSpotPrice(newSpot);
    applyPreset('STRANGLE', underlying, newSpot);
  }, [underlying]);

  const applyPreset = (preset: string, und: UnderlyingSymbol = underlying, baseSpot: number = spotPrice) => {
    const curLotSize = und === 'NIFTY' ? 50 : und === 'BANKNIFTY' ? 15 : 40;
    const curStep = und === 'BANKNIFTY' ? 100 : 50;
    const atm = Math.round(baseSpot / curStep) * curStep;

    let newLegs: OptionLeg[] = [];

    if (preset === 'STRADDLE') {
      newLegs = [
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'CE',
          action: 'SELL',
          strike: atm,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0075),
          currentPrice: Math.round(baseSpot * 0.0075),
          iv: 14.5,
        },
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'PE',
          action: 'SELL',
          strike: atm,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0075),
          currentPrice: Math.round(baseSpot * 0.0075),
          iv: 15.0,
        },
      ];
    } else if (preset === 'STRANGLE') {
      newLegs = [
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'CE',
          action: 'SELL',
          strike: atm + curStep * 4,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0035),
          currentPrice: Math.round(baseSpot * 0.0035),
          iv: 14.5,
        },
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'PE',
          action: 'SELL',
          strike: atm - curStep * 4,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0035),
          currentPrice: Math.round(baseSpot * 0.0035),
          iv: 15.2,
        },
      ];
    } else if (preset === 'IRON_CONDOR') {
      newLegs = [
        // Short OTM Strangle
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'CE',
          action: 'SELL',
          strike: atm + curStep * 4,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0035),
          currentPrice: Math.round(baseSpot * 0.0035),
          iv: 14.5,
        },
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'PE',
          action: 'SELL',
          strike: atm - curStep * 4,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0035),
          currentPrice: Math.round(baseSpot * 0.0035),
          iv: 15.2,
        },
        // Long Wings for Protection
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'CE',
          action: 'BUY',
          strike: atm + curStep * 8,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0012),
          currentPrice: Math.round(baseSpot * 0.0012),
          iv: 14.8,
        },
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'PE',
          action: 'BUY',
          strike: atm - curStep * 8,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0012),
          currentPrice: Math.round(baseSpot * 0.0012),
          iv: 15.5,
        },
      ];
    } else if (preset === 'BULL_CALL') {
      newLegs = [
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'CE',
          action: 'BUY',
          strike: atm,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0075),
          currentPrice: Math.round(baseSpot * 0.0075),
          iv: 14.5,
        },
        {
          id: 'leg-' + Math.random(),
          underlying: und,
          type: 'CE',
          action: 'SELL',
          strike: atm + curStep * 4,
          expiry: 'CURRENT',
          lots: 1,
          lotSize: curLotSize,
          entryPrice: Math.round(baseSpot * 0.0035),
          currentPrice: Math.round(baseSpot * 0.0035),
          iv: 14.5,
        },
      ];
    }

    setLegs(newLegs);
  };

  const updateLeg = (id: string, updates: Partial<OptionLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const removeLeg = (id: string) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  };

  const addLeg = (type: OptionType, action: OrderAction, strike: number, price: number) => {
    setLegs((prev) => [
      ...prev,
      {
        id: 'leg-' + Math.random(),
        underlying,
        type,
        action,
        strike,
        expiry: 'CURRENT',
        lots: 1,
        lotSize,
        entryPrice: price,
        currentPrice: price,
        iv: 15,
      },
    ]);
  };

  // Payoff calculations
  const payoffData = useMemo(() => {
    return calculateStrategyPayoff({
      legs,
      spotPrice,
      daysToExpiry,
      targetDaysRemaining: targetDays,
      targetIvShiftPct: targetIvShift,
    });
  }, [legs, spotPrice, daysToExpiry, targetDays, targetIvShift]);

  const handleDeployToProp = () => {
    const newPositions: Position[] = legs.map((leg) => {
      const qty = leg.lots * leg.lotSize;
      const charges = calculateIndianCharges({
        action: leg.action,
        price: leg.entryPrice,
        qty,
      });

      return {
        id: 'POS-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        symbol: `${leg.underlying} ${leg.strike} ${leg.type}`,
        underlying: leg.underlying,
        type: leg.type,
        action: leg.action,
        strike: leg.strike,
        expiry: leg.expiry,
        lots: leg.lots,
        qty,
        entryPrice: leg.entryPrice,
        currentPrice: leg.entryPrice,
        unrealizedPnL: 0,
        realizedPnL: 0,
        charges,
        openedAt: new Date().toISOString(),
      };
    });

    onDeployStrategy(newPositions);
    setDeploySuccess(true);
    setTimeout(() => setDeploySuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          {/* Underlying Selector */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Index / Underlying</label>
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'] as UnderlyingSymbol[]).map((sym) => (
                <button
                  key={sym}
                  onClick={() => setUnderlying(sym)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded ${
                    underlying === sym ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Spot Display */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Current Spot</label>
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-emerald-400">
              ₹{spotPrice.toLocaleString('en-IN')}
            </div>
          </div>

          {/* Days to Expiry */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Expiry Days</label>
            <select
              value={daysToExpiry}
              onChange={(e) => {
                const d = Number(e.target.value);
                setDaysToExpiry(d);
                setTargetDays(d);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-medium text-white focus:outline-none"
            >
              <option value={0}>0-DTE (Today Expiry)</option>
              <option value={1}>1 Day</option>
              <option value={2}>2 Days</option>
              <option value={4}>4 Days (Weekly)</option>
              <option value={11}>11 Days</option>
              <option value={25}>25 Days (Monthly)</option>
            </select>
          </div>
        </div>

        {/* Strategy Presets & Actions */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <select
              onChange={(e) => applyPreset(e.target.value)}
              defaultValue="STRANGLE"
              className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-700 hover:bg-slate-700 transition focus:outline-none cursor-pointer"
            >
              <option value="STRANGLE">Preset: Short Strangle</option>
              <option value="STRADDLE">Preset: Short Straddle</option>
              <option value="IRON_CONDOR">Preset: Iron Condor</option>
              <option value="BULL_CALL">Preset: Bull Call Spread</option>
            </select>
          </div>

          <button
            onClick={() => setShowOptionChain(!showOptionChain)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>{showOptionChain ? 'Hide Chain' : 'Option Chain'}</span>
          </button>

          <button
            onClick={handleDeployToProp}
            disabled={legs.length === 0}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition ${
              deploySuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{deploySuccess ? 'Deployed to Prop!' : 'Deploy to Prop Account'}</span>
          </button>
        </div>
      </div>

      {/* Option Chain Quick-Picker Modal / Drawer */}
      {showOptionChain && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-white">Quick Option Chain ({underlying})</span>
            <span className="text-slate-400">Click a Call or Put button to add leg to strategy</span>
          </div>

          <div className="overflow-x-auto max-h-64 border border-slate-800 rounded-lg">
            <table className="w-full text-center text-xs">
              <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3 text-cyan-400 font-semibold" colSpan={3}>
                    CALLS (CE)
                  </th>
                  <th className="py-2 px-3 font-bold text-white bg-slate-900">STRIKE</th>
                  <th className="py-2 px-3 text-amber-400 font-semibold" colSpan={3}>
                    PUTS (PE)
                  </th>
                </tr>
                <tr className="text-[10px] text-slate-500 border-t border-slate-800/80">
                  <th className="py-1 px-2">Buy</th>
                  <th className="py-1 px-2">Sell</th>
                  <th className="py-1 px-2">LTP</th>
                  <th className="py-1 px-2 bg-slate-900">Strike</th>
                  <th className="py-1 px-2">LTP</th>
                  <th className="py-1 px-2">Buy</th>
                  <th className="py-1 px-2">Sell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono text-xs">
                {[-6, -4, -2, 0, 2, 4, 6].map((offset) => {
                  const atm = Math.round(spotPrice / strikeStep) * strikeStep;
                  const strike = atm + offset * strikeStep;
                  const ceLtp = Math.max(1, Math.round(calculateBSPrice(spotPrice, strike, daysToExpiry / 365, 0.068, 0.15, 'CE')));
                  const peLtp = Math.max(1, Math.round(calculateBSPrice(spotPrice, strike, daysToExpiry / 365, 0.068, 0.15, 'PE')));

                  const isAtm = offset === 0;

                  return (
                    <tr key={strike} className={isAtm ? 'bg-emerald-500/10 font-bold' : 'hover:bg-slate-800/30'}>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => addLeg('CE', 'BUY', strike, ceLtp)}
                          className="px-2 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-500 text-cyan-200 text-[10px]"
                        >
                          B
                        </button>
                      </td>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => addLeg('CE', 'SELL', strike, ceLtp)}
                          className="px-2 py-0.5 rounded bg-rose-600/30 hover:bg-rose-500 text-rose-200 text-[10px]"
                        >
                          S
                        </button>
                      </td>
                      <td className="py-1.5 px-2 text-slate-300">₹{ceLtp}</td>
                      <td className="py-1.5 px-2 font-bold text-white bg-slate-900/60">{strike}</td>
                      <td className="py-1.5 px-2 text-slate-300">₹{peLtp}</td>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => addLeg('PE', 'BUY', strike, peLtp)}
                          className="px-2 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-500 text-cyan-200 text-[10px]"
                        >
                          B
                        </button>
                      </td>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => addLeg('PE', 'SELL', strike, peLtp)}
                          className="px-2 py-0.5 rounded bg-rose-600/30 hover:bg-rose-500 text-rose-200 text-[10px]"
                        >
                          S
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Grid: Left = Legs & Sliders, Right = Payoff Chart & Greeks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Legs Table & What-If Sliders */}
        <div className="lg:col-span-5 space-y-4">
          {/* Active Legs Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-xs text-white uppercase tracking-wider">Strategy Legs ({legs.length})</h3>
              <span className="text-[11px] text-slate-400">Lot Size: {lotSize}</span>
            </div>

            {legs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No active legs. Select a preset or use Option Chain above.
              </div>
            ) : (
              <div className="space-y-2">
                {legs.map((leg) => (
                  <div
                    key={leg.id}
                    className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateLeg(leg.id, { action: leg.action === 'BUY' ? 'SELL' : 'BUY' })}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          leg.action === 'BUY'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {leg.action}
                      </button>
                      <button
                        onClick={() => updateLeg(leg.id, { type: leg.type === 'CE' ? 'PE' : 'CE' })}
                        className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold"
                      >
                        {leg.type}
                      </button>
                      <span className="font-semibold text-white">{leg.strike}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] text-slate-500">Lots:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={leg.lots}
                          onChange={(e) => updateLeg(leg.id, { lots: Math.max(1, Number(e.target.value)) })}
                          className="w-10 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white"
                        />
                      </div>

                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] text-slate-500">₹:</span>
                        <input
                          type="number"
                          value={leg.entryPrice}
                          onChange={(e) => updateLeg(leg.id, { entryPrice: Math.max(0, Number(e.target.value)) })}
                          className="w-14 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white"
                        />
                      </div>

                      <button
                        onClick={() => removeLeg(leg.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive What-If Sliders */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h4 className="font-semibold text-white">Scenario "What-If" Sandbox</h4>
              </div>
              <button
                onClick={() => {
                  setTargetDays(daysToExpiry);
                  setTargetIvShift(0);
                  setTargetSpotPrice(spotPrice);
                }}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Reset Sliders
              </button>
            </div>

            {/* Slider 1: Days to Expiry / Target Date */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Target Date Simulation:</span>
                <span className="font-mono text-cyan-400 font-bold">{targetDays.toFixed(1)} days left</span>
              </div>
              <input
                type="range"
                min={0}
                max={daysToExpiry}
                step={0.1}
                value={targetDays}
                onChange={(e) => setTargetDays(Number(e.target.value))}
                className="w-full accent-cyan-400 bg-slate-800"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>At Expiry (T+0)</span>
                <span>Today (T+{daysToExpiry})</span>
              </div>
            </div>

            {/* Slider 2: Target IV Shift */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>IV Shift (Implied Volatility):</span>
                <span className={`font-mono font-bold ${targetIvShift >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {targetIvShift > 0 ? `+${targetIvShift}%` : `${targetIvShift}%`}
                </span>
              </div>
              <input
                type="range"
                min={-15}
                max={15}
                step={0.5}
                value={targetIvShift}
                onChange={(e) => setTargetIvShift(Number(e.target.value))}
                className="w-full accent-emerald-400 bg-slate-800"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>-15% IV Crush</span>
                <span>0%</span>
                <span>+15% Vol Spike</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (7 Cols): Payoff Diagram & Greeks HUD */}
        <div className="lg:col-span-7 space-y-4">
          {/* Key Summary Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Max Profit</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                {payoffData.maxProfit === 'UNLIMITED' ? 'UNLIMITED' : formatINR(payoffData.maxProfit)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Max Loss</span>
              <span className="text-sm font-bold font-mono text-rose-400">
                {payoffData.maxLoss === 'UNLIMITED' ? 'UNLIMITED' : formatINR(payoffData.maxLoss)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Prob of Profit (PoP)</span>
              <span className="text-sm font-bold font-mono text-cyan-400">{payoffData.probabilityOfProfit}%</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">SPAN Margin Est.</span>
              <span className="text-sm font-bold font-mono text-slate-200">
                {formatINR(payoffData.totalMarginEstimate)}
              </span>
            </div>
          </div>

          {/* Interactive Payoff Chart */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center space-x-4">
                <span className="font-semibold text-white">Strategy Payoff Curve</span>
                <div className="flex items-center space-x-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-slate-400 text-[11px]">Expiry Payoff</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="text-slate-400 text-[11px]">Target Date Payoff</span>
                </div>
              </div>
              <span className="text-slate-500 font-mono text-[11px]">
                Breakevens: {payoffData.breakevens.length > 0 ? payoffData.breakevens.join(', ') : 'None'}
              </span>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payoffData.payoffPoints} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="underlyingPrice"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(val) => Math.round(val).toString()}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                    labelFormatter={(val) => `Underlying: ₹${val}`}
                    formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, 'P&L']}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
                  <ReferenceLine x={spotPrice} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Spot', fill: '#f59e0b', fontSize: 10 }} />
                  {payoffData.breakevens.map((be) => (
                    <ReferenceLine key={be} x={be} stroke="#94a3b8" strokeDasharray="2 2" />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="expiryPayoff"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                    name="Expiry Payoff"
                  />
                  <Line
                    type="monotone"
                    dataKey="targetPayoff"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Target Date Payoff"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Strategy Greeks Breakdown */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Portfolio Greeks Sensitivity
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">Net Delta (Δ)</div>
                <div
                  className={`text-base font-bold mt-1 ${
                    payoffData.netGreeks.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {payoffData.netGreeks.delta}
                </div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">Directional exposure</div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">Net Gamma (Γ)</div>
                <div className="text-base font-bold mt-1 text-slate-200">{payoffData.netGreeks.gamma}</div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">Rate of delta shift</div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">Net Theta (Θ)</div>
                <div
                  className={`text-base font-bold mt-1 ${
                    payoffData.netGreeks.theta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatINR(payoffData.netGreeks.theta, true)}
                </div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">Daily time decay</div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">Net Vega (ν)</div>
                <div
                  className={`text-base font-bold mt-1 ${
                    payoffData.netGreeks.vega >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatINR(payoffData.netGreeks.vega, true)}
                </div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">Per 1% IV shift</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

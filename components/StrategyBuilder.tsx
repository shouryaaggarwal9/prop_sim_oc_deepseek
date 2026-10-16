'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Layers, Send, Sliders, Trash2 } from 'lucide-react';
import {
  UNDERLYING_SYMBOLS,
  getInstrument,
  roundToStrike,
  type OptionLeg,
  type OptionType,
  type OrderAction,
  type Position,
  type UnderlyingSymbol,
} from '@/lib/types';
import { calculateStrategyPayoff } from '@/lib/engine/strategySimulator';
import { buildOptionChain, premiumForStrike, roundToTick, solveImpliedVol } from '@/lib/engine/pricing';
import { calculateIndianCharges } from '@/lib/engine/indianTaxes';
import { cn, formatINR } from '@/lib/utils';

interface StrategyBuilderProps {
  onDeployStrategy: (newPositions: Position[]) => void;
}

type PresetKey = 'STRADDLE' | 'STRANGLE' | 'IRON_CONDOR' | 'BULL_CALL' | 'BEAR_PUT' | 'BULL_PUT';

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: 'STRADDLE', label: 'Short Straddle' },
  { value: 'STRANGLE', label: 'Short Strangle' },
  { value: 'IRON_CONDOR', label: 'Iron Condor' },
  { value: 'BULL_CALL', label: 'Bull Call Spread' },
  { value: 'BEAR_PUT', label: 'Bear Put Spread' },
  { value: 'BULL_PUT', label: 'Long Call (Bull Put)' },
];

const EXPIRY_OPTIONS = [0, 1, 2, 3, 4, 7, 11, 25] as const;

let legCounter = 0;
const nextLegId = () => `leg-${(legCounter += 1)}`;

/**
 * Build a preset from the live pricer so every entry price is Black-Scholes
 * consistent with its strike, IV and the chosen expiry. Previously presets
 * priced legs as a fixed percentage of spot, which ignored strike distance and
 * put/call skew and disagreed with the option chain shown on the same screen.
 */
function buildPreset(
  preset: PresetKey,
  symbol: UnderlyingSymbol,
  spot: number,
  daysToExpiry: number
): OptionLeg[] {
  const instrument = getInstrument(symbol);
  const step = instrument.strikeStep;
  const atm = roundToStrike(spot, symbol);

  const leg = (
    type: OptionType,
    action: OrderAction,
    strikeOffset: number,
    lots = 1
  ): OptionLeg => {
    const strike = atm + strikeOffset * step;
    const iv = Number(
      solveImpliedVol(
        premiumForStrike(symbol, type, strike, spot, daysToExpiry),
        symbol,
        type,
        strike,
        spot,
        daysToExpiry
      ) ?? instrument.atmIv
    );

    return {
      id: nextLegId(),
      underlying: symbol,
      type,
      action,
      strike,
      expiry: `${daysToExpiry}D`,
      lots,
      lotSize: instrument.lotSize,
      entryPrice: roundToTick(
        premiumForStrike(symbol, type, strike, spot, daysToExpiry)
      ),
      iv,
    };
  };

  switch (preset) {
    case 'STRADDLE':
      return [leg('CE', 'SELL', 0), leg('PE', 'SELL', 0)];
    case 'STRANGLE':
      return [leg('CE', 'SELL', 2), leg('PE', 'SELL', -2)];
    case 'IRON_CONDOR':
      return [
        leg('PE', 'BUY', -5),
        leg('PE', 'SELL', -2),
        leg('CE', 'SELL', 2),
        leg('CE', 'BUY', 5),
      ];
    case 'BULL_CALL':
      return [leg('CE', 'BUY', 0), leg('CE', 'SELL', 2)];
    case 'BEAR_PUT':
      return [leg('PE', 'BUY', 0), leg('PE', 'SELL', -2)];
    case 'BULL_PUT':
      return [leg('CE', 'BUY', 0)];
  }
}

export function StrategyBuilder({ onDeployStrategy }: StrategyBuilderProps) {
  const [underlying, setUnderlying] = useState<UnderlyingSymbol>('NIFTY');
  const [spotPrice, setSpotPrice] = useState(25050);
  const [daysToExpiry, setDaysToExpiry] = useState(4);
  const [targetDays, setTargetDays] = useState(4);
  const [targetIvShift, setTargetIvShift] = useState(0);
  const [targetSpotPrice, setTargetSpotPrice] = useState(25050);
  const [isChainOpen, setIsChainOpen] = useState(false);
  const [isDeployed, setIsDeployed] = useState(false);
  const [preset, setPreset] = useState<PresetKey>('STRANGLE');

  const instrument = getInstrument(underlying);

  // Presets are always priced from the current underlying, spot and expiry, so
  // the seed legs and every later edit share one pricing source.
  const [legs, setLegs] = useState<OptionLeg[]>(() =>
    buildPreset('STRANGLE', 'NIFTY', 25050, 4)
  );

  const applyPreset = useCallback(
    (nextPreset: PresetKey, symbol = underlying, spot = spotPrice, expiry = daysToExpiry) => {
      setLegs(buildPreset(nextPreset, symbol, spot, expiry));
    },
    [underlying, spotPrice, daysToExpiry]
  );

  const handleUnderlyingChange = (symbol: UnderlyingSymbol) => {
    const nextSpot = getInstrument(symbol).referenceSpot;
    setUnderlying(symbol);
    setSpotPrice(nextSpot);
    setTargetSpotPrice(nextSpot);
    setDaysToExpiry(4);
    setTargetDays(4);
    applyPreset(preset, symbol, nextSpot, 4);
  };

  const handleExpiryChange = (value: number) => {
    setDaysToExpiry(value);
    setTargetDays(value);
    applyPreset(preset, underlying, spotPrice, value);
  };

  const handleSpotCommit = (value: number) => {
    setSpotPrice(value);
    setTargetSpotPrice(value);
  };

  const payoffData = useMemo(
    () =>
      calculateStrategyPayoff({
        legs,
        spotPrice,
        daysToExpiry,
        targetDaysRemaining: targetDays,
        targetIvShiftPct: targetIvShift,
      }),
    [legs, spotPrice, daysToExpiry, targetDays, targetIvShift]
  );

  const chain = useMemo(
    () => buildOptionChain(underlying, spotPrice, daysToExpiry, 6),
    [underlying, spotPrice, daysToExpiry]
  );

  const updateLeg = (id: string, updates: Partial<OptionLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const removeLeg = (id: string) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  };

  const addLeg = (type: OptionType, action: OrderAction, strike: number, price: number, iv: number) => {
    setLegs((prev) => [
      ...prev,
      {
        id: nextLegId(),
        underlying,
        type,
        action,
        strike,
        expiry: `${daysToExpiry}D`,
        lots: 1,
        lotSize: instrument.lotSize,
        entryPrice: price,
        iv,
      },
    ]);
  };

  const handleDeploy = () => {
    if (legs.length === 0) return;

    const positions: Position[] = legs.map((leg) => {
      const qty = leg.lots * leg.lotSize;
      return {
        id: `POS-${nextLegId()}`,
        symbol: `${leg.underlying} ${leg.strike} ${leg.type}`,
        underlying: leg.underlying,
        type: leg.type,
        action: leg.action,
        strike: leg.strike,
        strikeOffset: Math.round(
          (leg.strike - roundToStrike(spotPrice, leg.underlying)) / getInstrument(leg.underlying).strikeStep
        ),
        expiry: leg.expiry,
        lots: leg.lots,
        qty,
        entryPrice: leg.entryPrice,
        currentPrice: leg.entryPrice,
        unrealizedPnL: 0,
        realizedPnL: 0,
        charges: calculateIndianCharges({ action: leg.action, price: leg.entryPrice, qty }),
        openedAt: new Date().toISOString(),
      };
    });

    onDeployStrategy(positions);
    setIsDeployed(true);
    window.setTimeout(() => setIsDeployed(false), 2500);
  };

  const resetSandbox = () => {
    setTargetDays(daysToExpiry);
    setTargetIvShift(0);
    setTargetSpotPrice(spotPrice);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span id="underlying-label" className="text-[11px] text-slate-400 block mb-1">
              Index / Underlying
            </span>
            <div
              role="group"
              aria-labelledby="underlying-label"
              className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800"
            >
              {UNDERLYING_SYMBOLS.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => handleUnderlyingChange(symbol)}
                  aria-pressed={underlying === symbol}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded transition',
                    underlying === symbol
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="spot-input" className="text-[11px] text-slate-400 block mb-1">
              Spot Price
            </label>
            <input
              id="spot-input"
              type="number"
              value={spotPrice}
              min={1}
              step={instrument.strikeStep}
              onChange={(e) => handleSpotCommit(Math.max(1, Number(e.target.value) || 1))}
              className="w-32 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-emerald-400"
            />
          </div>

          <div>
            <label htmlFor="expiry-select" className="text-[11px] text-slate-400 block mb-1">
              Days to Expiry
            </label>
            <select
              id="expiry-select"
              value={daysToExpiry}
              onChange={(e) => handleExpiryChange(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-medium text-white focus:outline-none"
            >
              {EXPIRY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? '0-DTE (today)' : d === 1 ? '1 Day' : `${d} Days`}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-slate-400 pb-2">
            Lot size <span className="font-mono text-slate-200">{instrument.lotSize}</span> • step{' '}
            <span className="font-mono text-slate-200">{instrument.strikeStep}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="preset-select" className="sr-only">
            Strategy preset
          </label>
          <select
            id="preset-select"
            value={preset}
            onChange={(e) => {
              const next = e.target.value as PresetKey;
              setPreset(next);
              applyPreset(next);
            }}
            className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-700 hover:bg-slate-700 transition focus:outline-none cursor-pointer"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsChainOpen((v) => !v)}
            aria-expanded={isChainOpen}
            aria-controls="option-chain-panel"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Layers className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>{isChainOpen ? 'Hide Chain' : 'Option Chain'}</span>
          </button>

          <button
            type="button"
            onClick={handleDeploy}
            disabled={legs.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed',
              isDeployed ? 'bg-emerald-600 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            )}
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>{isDeployed ? 'Deployed to Prop' : 'Deploy to Prop Account'}</span>
          </button>
        </div>
      </section>

      {isChainOpen ? (
        <section
          id="option-chain-panel"
          aria-label="Simulated option chain"
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3"
        >
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-white">
              Simulated Option Chain — {instrument.label}
            </span>
            <span className="text-slate-400">Click B or S to add a leg at that strike</span>
          </div>

          <div className="overflow-x-auto max-h-72 border border-slate-800 rounded-lg">
            <table className="w-full text-center text-xs">
              <caption className="sr-only">Option premiums with implied volatility by strike</caption>
              <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                <tr>
                  <th scope="col" colSpan={4} className="py-2 px-3 text-cyan-400 font-semibold">
                    CALLS (CE)
                  </th>
                  <th scope="col" className="py-2 px-3 font-bold text-white bg-slate-900">
                    STRIKE
                  </th>
                  <th scope="col" colSpan={4} className="py-2 px-3 text-amber-400 font-semibold">
                    PUTS (PE)
                  </th>
                </tr>
                <tr className="text-[10px] text-slate-500 border-t border-slate-800/80">
                  <th scope="col" className="py-1 px-2">Buy</th>
                  <th scope="col" className="py-1 px-2">Sell</th>
                  <th scope="col" className="py-1 px-2">LTP</th>
                  <th scope="col" className="py-1 px-2">IV%</th>
                  <th scope="col" className="py-1 px-2 bg-slate-900">Strike</th>
                  <th scope="col" className="py-1 px-2">IV%</th>
                  <th scope="col" className="py-1 px-2">LTP</th>
                  <th scope="col" className="py-1 px-2">Buy</th>
                  <th scope="col" className="py-1 px-2">Sell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {chain.map((row) => (
                  <tr
                    key={row.strike}
                    className={row.strike === roundToStrike(spotPrice, underlying) ? 'bg-emerald-500/10 font-bold' : 'hover:bg-slate-800/30'}
                  >
                    <ChainButton label={`Buy Nifty ${row.strike} call`} tone="buy" onClick={() => addLeg('CE', 'BUY', row.strike, row.CE.ltp, row.CE.iv)} />
                    <ChainButton label={`Sell Nifty ${row.strike} call`} tone="sell" onClick={() => addLeg('CE', 'SELL', row.strike, row.CE.ltp, row.CE.iv)} />
                    <td className="py-1.5 px-2 text-slate-300">₹{row.CE.ltp.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-slate-500">{row.CE.iv}</td>
                    <td className="py-1.5 px-2 font-bold text-white bg-slate-900/60">{row.strike}</td>
                    <td className="py-1.5 px-2 text-slate-500">{row.PE.iv}</td>
                    <td className="py-1.5 px-2 text-slate-300">₹{row.PE.ltp.toFixed(2)}</td>
                    <ChainButton label={`Buy Nifty ${row.strike} put`} tone="buy" onClick={() => addLeg('PE', 'BUY', row.strike, row.PE.ltp, row.PE.iv)} />
                    <ChainButton label={`Sell Nifty ${row.strike} put`} tone="sell" onClick={() => addLeg('PE', 'SELL', row.strike, row.PE.ltp, row.PE.iv)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">
            Synthetic chain priced with Black-Scholes using a volatility smile. Not a live feed.
          </p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
                Strategy Legs ({legs.length})
              </h3>
              <span className="text-[11px] text-slate-400">
                Net {payoffData.totalCost >= 0 ? 'debit' : 'credit'}{' '}
                <span className="font-mono text-slate-200">{formatINR(Math.abs(payoffData.totalCost))}</span>
              </span>
            </div>

            {legs.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No legs. Pick a preset or add contracts from the option chain.
              </p>
            ) : (
              <ul className="space-y-2">
                {legs.map((leg) => (
                  <li
                    key={leg.id}
                    className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateLeg(leg.id, { action: leg.action === 'BUY' ? 'SELL' : 'BUY' })}
                        aria-label={`Change ${leg.underlying} ${leg.strike} ${leg.type} side`}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold',
                          leg.action === 'BUY'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        )}
                      >
                        {leg.action}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLeg(leg.id, { type: leg.type === 'CE' ? 'PE' : 'CE' })}
                        aria-label={`Change ${leg.underlying} ${leg.strike} contract type`}
                        className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold"
                      >
                        {leg.type}
                      </button>
                      <span className="font-semibold text-white">{leg.strike}</span>
                      <span className="text-[10px] text-slate-500">IV {leg.iv}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-500">Lots</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={leg.lots}
                          aria-label={`Lots for ${leg.underlying} ${leg.strike} ${leg.type}`}
                          onChange={(e) =>
                            updateLeg(leg.id, {
                              lots: clampInt(e.target.value, 1, 100, leg.lots),
                            })
                          }
                          className="w-12 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-500">₹</span>
                        <input
                          type="number"
                          min={0}
                          step={0.05}
                          value={leg.entryPrice}
                          aria-label={`Entry premium for ${leg.underlying} ${leg.strike} ${leg.type}`}
                          onChange={(e) =>
                            updateLeg(leg.id, {
                              entryPrice: clampNumber(e.target.value, 0, 100000, leg.entryPrice),
                            })
                          }
                          className="w-16 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeLeg(leg.id)}
                        aria-label={`Remove ${leg.underlying} ${leg.strike} ${leg.type} leg`}
                        className="p-1 text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                <h4 className="font-semibold text-white">Scenario Sandbox</h4>
              </div>
              <button type="button" onClick={resetSandbox} className="text-[11px] text-slate-400 hover:text-white">
                Reset
              </button>
            </div>

            <SandboxSlider
              id="target-spot"
              label="Target Spot"
              value={targetSpotPrice}
              min={Math.round(spotPrice * 0.85)}
              max={Math.round(spotPrice * 1.15)}
              step={instrument.strikeStep}
              display={`₹${targetSpotPrice.toLocaleString('en-IN')}`}
              onChange={setTargetSpotPrice}
            />

            <SandboxSlider
              id="target-days"
              label="Target Date"
              value={targetDays}
              min={0}
              max={Math.max(0.1, daysToExpiry)}
              step={0.25}
              display={`${targetDays.toFixed(2)} days left`}
              onChange={setTargetDays}
            />

            <SandboxSlider
              id="target-iv"
              label="IV Shift"
              value={targetIvShift}
              min={-15}
              max={15}
              step={0.5}
              display={`${targetIvShift > 0 ? '+' : ''}${targetIvShift} pts`}
              tone={targetIvShift >= 0 ? 'accent-emerald-400' : 'accent-rose-400'}
              onChange={setTargetIvShift}
            />

            <p className="text-[10px] text-slate-500">
              IV shift is in percentage points applied to every leg. Positive lifts the whole surface.
            </p>
          </section>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryTile label="Max Profit" value={payoffData.maxProfit === 'UNLIMITED' ? 'UNLIMITED' : formatINR(payoffData.maxProfit)} tone="text-emerald-400" />
            <SummaryTile label="Max Loss" value={payoffData.maxLoss === 'UNLIMITED' ? 'UNLIMITED' : formatINR(payoffData.maxLoss)} tone="text-rose-400" />
            <SummaryTile label="Prob of Profit" value={`${payoffData.probabilityOfProfit}%`} tone="text-cyan-400" />
            <SummaryTile label="R:R" value={payoffData.riskRewardRatio} tone="text-slate-200" />
          </div>

          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-white">Payoff at Expiry</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span className="text-slate-400 text-[11px]">Expiry</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" aria-hidden="true" />
                  <span className="text-slate-400 text-[11px]">Target date</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                  <span className="text-slate-400 text-[11px]">Target spot</span>
                </span>
              </div>
              <span className="text-slate-500 font-mono text-[11px]">
                Breakevens:{' '}
                {payoffData.breakevens.length > 0 ? payoffData.breakevens.join(', ') : 'none'}
              </span>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={payoffData.payoffPoints} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="underlyingPrice"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v: number) => v.toLocaleString('en-IN')}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                    labelFormatter={(v) => `Underlying: ₹${Number(v).toLocaleString('en-IN')}`}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
                  <ReferenceLine
                    x={spotPrice}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    label={{ value: 'Spot', fill: '#f59e0b', fontSize: 10, position: 'top' }}
                  />
                  <ReferenceLine x={targetSpotPrice} stroke="#fbbf24" strokeDasharray="1 4" />
                  {payoffData.breakevens.map((be) => (
                    <ReferenceLine key={be} x={be} stroke="#94a3b8" strokeDasharray="2 2" />
                  ))}
                  <Area type="monotone" dataKey="expiryPayoff" stroke="#10b981" strokeWidth={2.5} fill="#10b981" fillOpacity={0.08} name="Expiry" isAnimationActive={false} />
                  <Line type="monotone" dataKey="targetPayoff" stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Target date" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Portfolio Greeks
            </h4>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <GreekTile label="Net Delta" value={payoffData.netGreeks.delta.toFixed(2)} hint="Directional" />
              <GreekTile label="Net Gamma" value={payoffData.netGreeks.gamma.toFixed(4)} hint="Delta shift" />
              <GreekTile label="Net Theta" value={formatINR(payoffData.netGreeks.theta, true)} hint="Per day" tone={payoffData.netGreeks.theta >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <GreekTile label="Net Vega" value={formatINR(payoffData.netGreeks.vega, true)} hint="Per 1% IV" tone={payoffData.netGreeks.vega >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <GreekTile label="SPAN Est." value={formatINR(payoffData.totalMarginEstimate)} hint="Per structure" tone="text-slate-200" />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function ChainButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: 'buy' | 'sell';
  onClick: () => void;
}) {
  return (
    <td className="py-1.5 px-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'px-2 py-0.5 rounded text-[10px] font-bold',
          tone === 'buy'
            ? 'bg-cyan-600/30 hover:bg-cyan-500 text-cyan-200'
            : 'bg-rose-600/30 hover:bg-rose-500 text-rose-200'
        )}
      >
        {tone === 'buy' ? 'B' : 'S'}
      </button>
    </td>
  );
}

function SandboxSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  tone = 'accent-cyan-400',
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  tone?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-slate-300">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono font-bold text-slate-100">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clampNumber(e.target.value, min, max, value))}
        className={cn('w-full bg-slate-800', tone)}
      />
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
      <span className="text-[11px] text-slate-400 block">{label}</span>
      <span className={cn('text-sm font-bold font-mono', tone)}>{value}</span>
    </div>
  );
}

function GreekTile({
  label,
  value,
  hint,
  tone = 'text-slate-100',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className={cn('text-base font-bold mt-1 font-mono', tone)}>{value}</dd>
      <p className="text-[9px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );
}

/** Never let a text input inject NaN into the pricing engine. */
function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(raw, min, max, fallback));
}
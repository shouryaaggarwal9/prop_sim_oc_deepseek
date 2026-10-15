'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PRESET_HISTORICAL_SESSIONS } from '@/lib/data/sampleHistoricalData';
import { HistoricalBar, PropAccount, Position, OrderAction, OptionType } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import { calculateIndianCharges } from '@/lib/engine/indianTaxes';
import { evaluatePropRisk } from '@/lib/engine/propRisk';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  FastForward,
  Clock,
  TrendingUp,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface MarketReplayViewProps {
  propAccount: PropAccount;
  onUpdatePropAccount: (updatedAccount: PropAccount) => void;
}

export const MarketReplayView: React.FC<MarketReplayViewProps> = ({
  propAccount,
  onUpdatePropAccount,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>('nifty-expiry-theta');
  const session = PRESET_HISTORICAL_SESSIONS.find((s) => s.id === selectedSessionId) || PRESET_HISTORICAL_SESSIONS[0];

  const [currentIndex, setCurrentIndex] = useState<number>(5); // start around 09:20
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1); // 1x, 5x, 15x, 30x

  // Replay-specific positions
  const [replayPositions, setReplayPositions] = useState<Position[]>([]);
  const [realizedPnL, setRealizedPnL] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentBar: HistoricalBar = session.bars[currentIndex] || session.bars[0];
  const chartData = session.bars.slice(0, currentIndex + 1);

  const lotSize = session.underlying === 'NIFTY' ? 50 : 15;

  // Auto-play interval
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(50, Math.floor(1000 / speed));
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= session.bars.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, session.bars.length]);

  // Update positions MTM and check Prop Risk on every bar tick
  useEffect(() => {
    if (replayPositions.length === 0) return;

    let totalUnrealized = 0;
    const updatedPositions = replayPositions.map((pos) => {
      const currentLtp = pos.type === 'CE' ? (currentBar.ceLtp || pos.entryPrice) : (currentBar.peLtp || pos.entryPrice);
      const points = pos.action === 'BUY' ? currentLtp - pos.entryPrice : pos.entryPrice - currentLtp;
      const mtm = points * pos.qty;
      totalUnrealized += mtm;

      return {
        ...pos,
        currentPrice: currentLtp,
        unrealizedPnL: Math.round(mtm),
      };
    });

    setReplayPositions(updatedPositions);

    // Evaluate Prop Risk Daemon
    const riskResult = evaluatePropRisk(propAccount, totalUnrealized + realizedPnL);
    if (riskResult.hasBreached) {
      setIsPlaying(false);
      // Square off all
      setReplayPositions([]);
      setRealizedPnL(totalUnrealized + realizedPnL);
      onUpdatePropAccount(riskResult.updatedAccount);
    } else {
      onUpdatePropAccount(riskResult.updatedAccount);
    }
  }, [currentIndex]);

  const handleExecute = (type: OptionType, action: OrderAction) => {
    const ltp = type === 'CE' ? (currentBar.ceLtp || 100) : (currentBar.peLtp || 100);
    const strike = Math.round(currentBar.close / 50) * 50;
    const qty = lotSize;

    const charges = calculateIndianCharges({
      action,
      price: ltp,
      qty,
    });

    const newPos: Position = {
      id: 'REP-' + Math.random().toString(36).substring(2, 7),
      symbol: `${session.underlying} ${strike} ${type}`,
      underlying: session.underlying,
      type,
      action,
      strike,
      expiry: session.date,
      lots: 1,
      qty,
      entryPrice: ltp,
      currentPrice: ltp,
      unrealizedPnL: 0,
      realizedPnL: 0,
      charges,
      openedAt: currentBar.timeStr,
    };

    setReplayPositions((prev) => [...prev, newPos]);
  };

  const handleSquareOffPos = (id: string) => {
    const pos = replayPositions.find((p) => p.id === id);
    if (pos) {
      setRealizedPnL((prev) => prev + pos.unrealizedPnL);
      setReplayPositions((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleResetReplay = () => {
    setIsPlaying(false);
    setCurrentIndex(5);
    setReplayPositions([]);
    setRealizedPnL(0);
  };

  const totalMTM = replayPositions.reduce((acc, p) => acc + p.unrealizedPnL, 0) + realizedPnL;

  return (
    <div className="space-y-6">
      {/* Session Header & Tape Controls */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Session Picker */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Select Historical Expiry Session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                handleResetReplay();
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-white focus:outline-none"
            >
              {PRESET_HISTORICAL_SESSIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.date})
                </option>
              ))}
            </select>
          </div>

          {/* Clock & Speed HUD */}
          <div className="flex items-center space-x-3">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-base font-bold text-white">{currentBar.timeStr} IST</span>
              <span className="text-[10px] text-slate-500 font-sans">({currentIndex + 1} / 375 min)</span>
            </div>

            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {[1, 5, 15, 30].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-1 text-[11px] font-bold rounded ${
                    speed === s ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : 'Play Replay'}</span>
            </button>

            <button
              onClick={() => setCurrentIndex((prev) => Math.min(session.bars.length - 1, prev + 1))}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title="Step +1 Minute"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetReplay}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title="Reset to 09:20"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeline Scrubber */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={session.bars.length - 1}
            value={currentIndex}
            onChange={(e) => setCurrentIndex(Number(e.target.value))}
            className="w-full accent-cyan-400 bg-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>09:15 Market Open</span>
            <span>12:00 Midday</span>
            <span>14:00 Gamma Zone</span>
            <span>15:30 Market Close</span>
          </div>
        </div>
      </div>

      {/* Replay Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 Cols): Candlestick / Minute Chart */}
        <div className="lg:col-span-8 space-y-4">
          {/* Live Quote Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Spot Price</span>
              <span className="text-base font-bold font-mono text-emerald-400">
                ₹{currentBar.close.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">ATM CE Premium</span>
              <span className="text-base font-bold font-mono text-cyan-400">₹{currentBar.ceLtp}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">ATM PE Premium</span>
              <span className="text-base font-bold font-mono text-amber-400">₹{currentBar.peLtp}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Replay MTM P&L</span>
              <span
                className={`text-base font-bold font-mono ${
                  totalMTM >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatINR(totalMTM, true)}
              </span>
            </div>
          </div>

          {/* Intraday Chart */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white">
                  {session.underlying} Intraday Tape ({session.date})
                </span>
              </div>
              <span className="text-slate-400 text-[11px]">{session.description}</span>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeStr" stroke="#64748b" fontSize={11} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => Math.round(val).toString()}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Spot Price"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column (4 Cols): Quick Execution & Replay Positions */}
        <div className="lg:col-span-4 space-y-4">
          {/* Quick Execution Pad */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
                Virtual Execution Pad (1 Lot)
              </h3>
            </div>
            <p className="text-[11px] text-slate-400">
              Orders placed here reflect live against your active Prop Challenge limits.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <button
                onClick={() => handleExecute('CE', 'SELL')}
                className="p-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/40 text-rose-200 font-bold transition flex flex-col items-center"
              >
                <span>SELL ATM CE</span>
                <span className="text-[10px] text-rose-300 font-normal">@ ₹{currentBar.ceLtp}</span>
              </button>

              <button
                onClick={() => handleExecute('PE', 'SELL')}
                className="p-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/40 text-rose-200 font-bold transition flex flex-col items-center"
              >
                <span>SELL ATM PE</span>
                <span className="text-[10px] text-rose-300 font-normal">@ ₹{currentBar.peLtp}</span>
              </button>

              <button
                onClick={() => handleExecute('CE', 'BUY')}
                className="p-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-600/40 text-cyan-200 font-medium transition flex flex-col items-center"
              >
                <span>BUY ATM CE</span>
                <span className="text-[10px] text-cyan-300 font-normal">@ ₹{currentBar.ceLtp}</span>
              </button>

              <button
                onClick={() => handleExecute('PE', 'BUY')}
                className="p-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-600/40 text-cyan-200 font-medium transition flex flex-col items-center"
              >
                <span>BUY ATM PE</span>
                <span className="text-[10px] text-cyan-300 font-normal">@ ₹{currentBar.peLtp}</span>
              </button>
            </div>
          </div>

          {/* Active Replay Positions */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-xs text-white uppercase tracking-wider">
                Replay Trades ({replayPositions.length})
              </h4>
              <span className="text-[11px] text-slate-400">Lot: {lotSize}</span>
            </div>

            {replayPositions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No active replay positions. Click an order button above.
              </div>
            ) : (
              <div className="space-y-2">
                {replayPositions.map((pos) => {
                  const isProfit = pos.unrealizedPnL >= 0;
                  return (
                    <div
                      key={pos.id}
                      className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono flex items-center justify-between"
                    >
                      <div>
                        <div className="text-white font-sans font-medium text-[11px]">
                          {pos.action} {pos.symbol}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          ₹{pos.entryPrice} → ₹{pos.currentPrice}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatINR(pos.unrealizedPnL, true)}
                        </span>
                        <button
                          onClick={() => handleSquareOffPos(pos.id)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                        >
                          Exit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

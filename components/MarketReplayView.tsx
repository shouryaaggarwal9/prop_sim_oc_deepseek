'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Clock,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  PRESET_HISTORICAL_SESSIONS,
  SESSION_MINUTES,
  getSession,
  lastBarIndex,
  optionPremiumAtBar,
} from '@/lib/data/sampleHistoricalData';
import {
  getInstrument,
  type OptionType,
  type OrderAction,
  type Position,
  type PropAccount,
} from '@/lib/types';
import { calculateIndianCharges } from '@/lib/engine/indianTaxes';
import { bookRealizedPnl } from '@/lib/engine/propRisk';
import { cn, formatINR } from '@/lib/utils';

interface MarketReplayViewProps {
  propAccount: PropAccount;
  /**
   * Applies a pure transition to the shared prop account. The replay never
   * stores its own copy, so the parent stays the single source of truth.
   */
  onUpdateAccount: (updater: (account: PropAccount) => PropAccount) => void;
}

const SPEEDS = [1, 5, 15, 30] as const;
const START_INDEX = 5;
const EMPTY_LEGS: OpenLeg[] = [];

let replayCounter = 0;
const nextId = () => `REP-${(replayCounter += 1)}-${Math.random().toString(36).slice(2, 6)}`;

/** The stored shape: everything except the mark, which is derived. */
type OpenLeg = Omit<Position, 'currentPrice' | 'unrealizedPnL'>;

export function MarketReplayView({ propAccount, onUpdateAccount }: MarketReplayViewProps) {
  const [sessionId, setSessionId] = useState(PRESET_HISTORICAL_SESSIONS[0]?.id ?? '');
  const [currentIndex, setCurrentIndex] = useState(START_INDEX);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [legs, setLegs] = useState<OpenLeg[]>([]);

  const session = getSession(sessionId);
  const endIndex = session ? lastBarIndex(session) : 0;
  const bar = session?.bars[Math.min(currentIndex, endIndex)];

  /**
   * A breached account halts the tape. Deriving this instead of clearing legs
   * in an effect keeps the replay free of synchronising state and means a
   * liquidation can never be a tick late.
   */
  const isHalted = propAccount.status === 'FAILED';
  const activeLegs = isHalted ? EMPTY_LEGS : legs;
  const canPlay = isPlaying && !isHalted;

  /**
   * Mark every open leg against the live bar. Deriving the mark during render
   * keeps the tape, the P&L figures and the risk engine on exactly the same
   * number, with no effect to fall a tick behind.
   */
  const positions = useMemo<Position[]>(() => {
    if (!session) return [];
    return activeLegs.map((leg) => {
      const quote = optionPremiumAtBar(session, currentIndex, leg.type, leg.strikeOffset);
      const points = leg.action === 'BUY' ? quote.premium - leg.entryPrice : leg.entryPrice - quote.premium;
      return {
        ...leg,
        currentPrice: quote.premium,
        unrealizedPnL: Math.round(points * leg.qty),
      };
    });
  }, [session, currentIndex, activeLegs]);

  const totalMtm = useMemo(
    () => positions.reduce((acc, p) => acc + p.unrealizedPnL, 0),
    [positions]
  );

  const openMtm = positions.length > 0 ? totalMtm : 0;

  const chartData = useMemo(
    () => (session ? session.bars.slice(0, Math.min(currentIndex, endIndex) + 1) : []),
    [session, currentIndex, endIndex]
  );

  // Push the open P&L into the shared account. The parent's risk guard decides
  // whether this breaches; the replay only reports what is open.
  const hasOpenLegs = positions.length > 0;
  useEffect(() => {
    if (!hasOpenLegs || isHalted) return;
    onUpdateAccount((account) => {
      const next = { ...account, currentEquity: account.currentBalance + openMtm };
      return next.currentEquity === account.currentEquity ? account : next;
    });
  }, [hasOpenLegs, isHalted, openMtm, onUpdateAccount]);

  useEffect(() => {
    if (!canPlay || !session) return;

    const intervalMs = Math.max(50, Math.round(1000 / speed));
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= endIndex) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [canPlay, speed, session, endIndex]);

  const execute = useCallback(
    (type: OptionType, action: OrderAction) => {
      if (!session || !bar) return;
      const instrument = getInstrument(session.underlying);
      const quote = optionPremiumAtBar(session, currentIndex, type, 0);

      const leg: OpenLeg = {
        id: nextId(),
        symbol: `${instrument.label} ${quote.strike} ${type}`,
        underlying: session.underlying,
        type,
        action,
        strike: quote.strike,
        strikeOffset: 0,
        expiry: session.date,
        lots: 1,
        qty: instrument.lotSize,
        entryPrice: quote.premium,
        realizedPnL: 0,
        charges: calculateIndianCharges({
          action,
          price: quote.premium,
          qty: instrument.lotSize,
        }),
        openedAt: bar.timeStr,
      };

      setLegs((prev) => [...prev, leg]);
    },
    [session, bar, currentIndex]
  );

  const squareOff = useCallback(
    (id: string) => {
      const target = positions.find((p) => p.id === id);
      if (!target) return;
      onUpdateAccount((account) => bookRealizedPnl(account, target.unrealizedPnL));
      setLegs((prev) => prev.filter((p) => p.id !== id));
    },
    [positions, onUpdateAccount]
  );

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(START_INDEX);
    setLegs([]);
  }, []);

  if (!session || !bar) {
    return (
      <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-500">
        No replay session available.
      </p>
    );
  }

  const atmCe = optionPremiumAtBar(session, currentIndex, 'CE');
  const atmPe = optionPremiumAtBar(session, currentIndex, 'PE');
  const instrument = getInstrument(session.underlying);

  return (
    <div className="space-y-6">
      <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <label htmlFor="session-select" className="text-[11px] text-slate-400 block mb-1">
              Historical Expiry Session
            </label>
            <select
              id="session-select"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                reset();
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

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span className="font-mono text-base font-bold text-white">{bar.timeStr} IST</span>
              <span className="text-[10px] text-slate-500 font-sans">
                ({currentIndex + 1} / {session.bars.length})
              </span>
            </div>

            <div
              role="group"
              aria-label="Replay speed"
              className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800"
            >
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cn(
                    'px-2 py-1 text-[11px] font-bold rounded transition',
                    speed === s ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((v) => !v)}
              disabled={currentIndex >= endIndex || isHalted}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition disabled:opacity-40',
                canPlay ? 'bg-amber-500 text-slate-950' : 'bg-emerald-500 text-slate-950'
              )}
            >
              {canPlay ? (
                <Pause className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{canPlay ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(endIndex, prev + 1))}
              disabled={currentIndex >= endIndex}
              aria-label="Step forward one minute"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40"
            >
              <SkipForward className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Reset replay to the open"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="timeline" className="sr-only">
            Replay timeline
          </label>
          <input
            id="timeline"
            type="range"
            min={0}
            max={endIndex}
            value={Math.min(currentIndex, endIndex)}
            onChange={(e) =>
              setCurrentIndex(Math.min(endIndex, Math.max(0, Number(e.target.value))))
            }
            className="w-full accent-cyan-400 bg-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>09:15 Open</span>
            <span>12:00 Midday</span>
            <span>14:00 Gamma Zone</span>
            <span>15:30 Close</span>
          </div>
        </div>
      </section>

      {isHalted ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-600/60 bg-rose-950/50 p-4 text-xs text-rose-200"
        >
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" aria-hidden="true" />
          <span>
            <strong className="block text-white mb-0.5">Replay halted</strong>
            {propAccount.breachReason ?? 'The challenge account is no longer active.'}
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Spot" value={`₹${bar.close.toLocaleString('en-IN')}`} tone="text-emerald-400" />
            <Tile
              label="ATM CE"
              value={`₹${atmCe.premium.toFixed(2)}`}
              sub={`IV ${atmCe.ivPct.toFixed(1)}%`}
              tone="text-cyan-400"
            />
            <Tile
              label="ATM PE"
              value={`₹${atmPe.premium.toFixed(2)}`}
              sub={`IV ${atmPe.ivPct.toFixed(1)}%`}
              tone="text-amber-400"
            />
            <Tile
              label="Open MTM"
              value={formatINR(openMtm, true)}
              tone={openMtm >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
          </div>

          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span className="font-semibold text-white">
                  {instrument.label} Intraday Tape ({session.date})
                </span>
              </div>
              <span className="text-slate-400 text-[11px]">{session.description}</span>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeStr" stroke="#64748b" fontSize={11} minTickGap={40} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => v.toLocaleString('en-IN')}
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
                    name="Spot"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
                Virtual Execution Pad
              </h3>
            </div>
            <p className="text-[11px] text-slate-400">
              1 lot of the at-the-money {instrument.label} option, marked live against your active
              challenge limits.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <OrderButton label="SELL ATM CE" price={atmCe.premium} tone="sell" onClick={() => execute('CE', 'SELL')} />
              <OrderButton label="SELL ATM PE" price={atmPe.premium} tone="sell" onClick={() => execute('PE', 'SELL')} />
              <OrderButton label="BUY ATM CE" price={atmCe.premium} tone="buy" onClick={() => execute('CE', 'BUY')} />
              <OrderButton label="BUY ATM PE" price={atmPe.premium} tone="buy" onClick={() => execute('PE', 'BUY')} />
            </div>
          </section>

          <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-xs text-white uppercase tracking-wider">
                Replay Trades ({positions.length})
              </h4>
              <span className="text-[11px] text-slate-400">Lot: {instrument.lotSize}</span>
            </div>

            {positions.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No active positions. Use the order pad above.
              </p>
            ) : (
              <ul className="space-y-2">
                {positions.map((pos) => (
                  <li
                    key={pos.id}
                    className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-white font-sans font-medium text-[11px] truncate">
                        {pos.action} {pos.symbol}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        ₹{pos.entryPrice.toFixed(2)} → ₹{pos.currentPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          'font-bold',
                          pos.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {formatINR(pos.unrealizedPnL, true)}
                      </span>
                      <button
                        type="button"
                        onClick={() => squareOff(pos.id)}
                        aria-label={`Exit ${pos.symbol}`}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                      >
                        Exit
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
              {SESSION_MINUTES}-minute session. Premiums are Black-Scholes consistent with the live bar
              and the time remaining in the session.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
      <span className="text-[11px] text-slate-400 block">{label}</span>
      <span className={cn('text-base font-bold font-mono', tone)}>{value}</span>
      {sub ? <span className="text-[10px] text-slate-500 block">{sub}</span> : null}
    </div>
  );
}

function OrderButton({
  label,
  price,
  tone,
  onClick,
}: {
  label: string;
  price: number;
  tone: 'buy' | 'sell';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-2.5 rounded-lg font-bold transition flex flex-col items-center',
        tone === 'sell'
          ? 'bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/40 text-rose-200'
          : 'bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-600/40 text-cyan-200'
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] font-normal opacity-80">@ ₹{price.toFixed(2)}</span>
    </button>
  );
}
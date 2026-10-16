'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navbar, type AppTab } from '@/components/Navbar';
import { PropFirmDashboard } from '@/components/PropFirmDashboard';
import { StrategyBuilder } from '@/components/StrategyBuilder';
import { BacktesterView } from '@/components/BacktesterView';
import { MarketReplayView } from '@/components/MarketReplayView';
import { TaxCalculatorView } from '@/components/TaxCalculatorModal';
import { AccountModal } from '@/components/AccountModal';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useSyntheticSpot } from '@/lib/hooks/useSyntheticMarket';
import type { Position, PropAccount, UnderlyingSymbol } from '@/lib/types';
import { getInstrument } from '@/lib/types';
import { premiumForStrike } from '@/lib/engine/pricing';
import {
  createPropAccount,
  evaluatePropRisk,
  requestPayout,
  rollOverTradingDay,
  syncTradingDate,
  withdrawableProfit,
} from '@/lib/engine/propRisk';
import { closePositions, realisedPnlForDate } from '@/lib/engine/tradeLedger';

interface AppState {
  account: PropAccount;
  positions: Position[];
}

/** Days assumed for marking legs opened in the Prop Terminal. */
const MARKING_DAYS_TO_EXPIRY = 3;

/** Module-level so the identity is stable across renders (required by useSyncExternalStore). */
const initialState: AppState = {
  account: createPropAccount('Quant Trader', 'pro-10l', false),
  positions: [],
};

/**
 * Backfill fields added after the persisted payload was first written.
 *
 * Must stay module-level: `usePersistentState` caches snapshots by storage key,
 * so an inline arrow here would change identity on every render.
 */
function migrateAppState(raw: unknown): AppState {
  const stored = (raw ?? {}) as Partial<AppState>;
  const account = stored.account;
  if (!account) return initialState;

  return {
    account: { ...account, closedTrades: account.closedTrades ?? [] },
    positions: stored.positions ?? [],
  };
}

/**
 * Mark an open leg against the synthetic spot clock.
 *
 * Marking happens while rendering rather than being stored, so the position
 * table, the equity headline and the risk engine can never disagree about
 * what a position is worth.
 */
function markPosition(position: Position, spot: number): Position {
  const ltp = premiumForStrike(
    position.underlying,
    position.type,
    position.strike,
    spot,
    MARKING_DAYS_TO_EXPIRY
  );
  const points =
    position.action === 'BUY' ? ltp - position.entryPrice : position.entryPrice - ltp;

  return {
    ...position,
    currentPrice: Math.round(ltp * 100) / 100,
    unrealizedPnL: Math.round(points * position.qty),
  };
}

/**
 * Apply the prop risk rules to a candidate state.
 *
 * This runs inside every state transition rather than in an effect, so equity
 * can never be observed stale by the UI and a breach liquidates in the same
 * commit that causes it.
 */
function applyRiskGuard(next: AppState, marks: Map<string, number>): AppState {
  // Only a failed account is terminal. A passed funded account keeps trading
  // and must stay under live breach monitoring.
  if (next.account.status === 'FAILED') return next;

  // Mark the book first, so the risk engine, the liquidation and the ledger are
  // all reading the same numbers.
  const marked = next.positions.map((p) => ({
    ...p,
    unrealizedPnL: marks.get(p.id) ?? p.unrealizedPnL,
  }));
  const unrealized = marked.reduce((acc, p) => acc + p.unrealizedPnL, 0);

  const result = evaluatePropRisk(next.account, unrealized);
  if (result.updatedAccount === next.account) return next;

  // A hard breach liquidates the book. A liquidation realises P&L, so it is
  // booked and recorded exactly like any other close.
  if (result.hasBreached) {
    const { account } = closePositions(result.updatedAccount, marked, 'RISK_BREACH');
    return { account, positions: [] };
  }

  return { account: result.updatedAccount, positions: next.positions };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>('PROP');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [state, setState] = usePersistentState<AppState>(
    'quantprop:state:v1',
    initialState,
    migrateAppState
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [markingUnderlying, setMarkingUnderlying] = useState<UnderlyingSymbol>('NIFTY');

  const { account, positions: storedPositions } = state;

  const spot = useSyntheticSpot(markingUnderlying);

  const positions = useMemo(
    () => storedPositions.map((p) => markPosition(p, spot)),
    [storedPositions, spot]
  );

  const marks = useMemo(
    () => new Map(positions.map((p) => [p.id, p.unrealizedPnL] as const)),
    [positions]
  );

  const commit = useCallback(
    (mutate: (prev: AppState) => AppState) => {
      setState((prev) => applyRiskGuard(mutate(prev), marks));
    },
    [setState, marks]
  );

  /** Roll the calendar day forward if the app was left open overnight. */
  useEffect(() => {
    const tick = () => commit((prev) => ({ ...prev, account: syncTradingDate(prev.account) }));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [commit]);

  const handleDeployStrategy = useCallback(
    (newPositions: Position[]) => {
      const first = newPositions[0];
      // Mark the deployed structure against the clock for its own underlying.
      if (first) setMarkingUnderlying(first.underlying);
      commit((prev) => ({ ...prev, positions: [...prev.positions, ...newPositions] }));
      setActiveTab('PROP');
    },
    [commit]
  );

  const handleSquareOffPosition = useCallback(
    (positionId: string) => {
      // Close from the marked book, not the stored one, so the ledger records
      // the same exit price the trader was just looking at.
      const target = positions.find((p) => p.id === positionId);
      if (!target) return;

      commit((prev) => {
        const { account: nextAccount } = closePositions(prev.account, [target], 'MANUAL');
        return {
          account: nextAccount,
          positions: prev.positions.filter((p) => p.id !== positionId),
        };
      });
    },
    [commit, positions]
  );

  const handleSquareOffAll = useCallback(() => {
    commit((prev) => {
      const { account: nextAccount } = closePositions(prev.account, positions, 'SQUARE_OFF_ALL');
      return { account: nextAccount, positions: [] };
    });
  }, [commit, positions]);

  const handleResetAccount = useCallback(() => {
    setState((prev) => ({
      account: createPropAccount(
        prev.account.traderName,
        prev.account.ruleConfig.id,
        prev.account.phase === 'FUNDED'
      ),
      positions: [],
    }));
    setNotice(null);
  }, [setState]);

  /** Close the trading day: book P&L, count the day, reset the daily anchor. */
  const handleEndTradingDay = useCallback(() => {
    commit((prev) => {
      // Every close already booked its own P&L into the balance, so the day's
      // figure is read from the ledger rather than passed as an unbooked delta.
      const dayPnl = realisedPnlForDate(
        prev.account.closedTrades,
        prev.account.currentTradingDate
      );
      return { ...prev, account: rollOverTradingDay(prev.account, 0, undefined, dayPnl) };
    });
    setNotice('Trading day closed. Daily loss limit reset and day counter advanced.');
  }, [commit]);

  const handleRequestPayout = useCallback(
    (amount: number) => {
      // Flatten the book through the ledger first, so the payout desk and the
      // trader's journal agree on what was realised.
      const { account: flattened } = closePositions(account, positions, 'PAYOUT_FLATTEN');
      const result = requestPayout(flattened, amount);
      if (result.error) {
        setNotice(result.error);
        return;
      }
      commit(() => ({ account: result.updatedAccount, positions: [] }));
      setNotice('Simulated payout credited to your wallet.');
    },
    [account, positions, commit]
  );

  const handleSelectPreset = useCallback(
    (traderName: string, presetId: string, instantFunded: boolean) => {
      setState({
        account: createPropAccount(traderName, presetId, instantFunded),
        positions: [],
      });
      setNotice(null);
    },
    [setState]
  );

  const handleReplayAccountUpdate = useCallback(
    (updater: (prev: PropAccount) => PropAccount) => {
      commit((prev) => ({ ...prev, account: updater(prev.account) }));
    },
    [commit]
  );

  const withdrawable = useMemo(() => withdrawableProfit(account), [account]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        account={account}
        onNewAccount={() => setIsAccountModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-4 py-2.5 text-xs text-cyan-200"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="font-semibold text-cyan-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {activeTab === 'PROP' && (
          <PropFirmDashboard
            account={account}
            positions={positions}
            withdrawable={withdrawable}
            spot={spot}
            spotUnderlying={getInstrument(markingUnderlying).label}
            onSquareOffPosition={handleSquareOffPosition}
            onSquareOffAll={handleSquareOffAll}
            onResetAccount={handleResetAccount}
            onEndTradingDay={handleEndTradingDay}
            onRequestPayout={handleRequestPayout}
          />
        )}

        {activeTab === 'STRATEGY' && (
          <StrategyBuilder onDeployStrategy={handleDeployStrategy} />
        )}

        {activeTab === 'BACKTEST' && <BacktesterView />}

        {activeTab === 'REPLAY' && (
          <MarketReplayView
            propAccount={account}
            onUpdateAccount={handleReplayAccountUpdate}
          />
        )}

        {activeTab === 'TAXES' && <TaxCalculatorView />}
      </main>

      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        QuantProp India • Open-Source Indian Derivatives &amp; Prop Firm Simulator • Simulated trading only
      </footer>

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSelectPreset={handleSelectPreset}
      />
    </div>
  );
}

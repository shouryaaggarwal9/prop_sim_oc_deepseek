'use client';

import { useEffect, useState } from 'react';
import { type UnderlyingSymbol, getInstrument } from '@/lib/types';

/**
 * A lightweight synthetic spot clock.
 *
 * The app has no market data feed by design, but a prop simulator whose
 * positions never move cannot demonstrate a drawdown, a liquidation or a
 * profit target. This supplies a plausible, continuously updating spot so the
 * Prop Terminal is genuinely live. It is explicitly not a market feed.
 *
 * State is keyed by underlying, so switching symbol resolves to that symbol's
 * reference spot with no reset effect and no render-phase ref writes.
 */
export function useSyntheticSpot(underlying: UnderlyingSymbol, intervalMs = 2500): number {
  const [spots, setSpots] = useState<Partial<Record<UnderlyingSymbol, number>>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      const anchor = getInstrument(underlying).referenceSpot;

      setSpots((prev) => {
        const current = prev[underlying] ?? anchor;
        // Mean reversion keeps the walk bounded around the reference level.
        const pull = (anchor - current) * 0.02;
        const noise = (Math.random() - 0.5) * anchor * 0.0018;
        const next = Math.max(1, current + pull + noise);
        return { ...prev, [underlying]: next };
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [underlying, intervalMs]);

  return spots[underlying] ?? getInstrument(underlying).referenceSpot;
}
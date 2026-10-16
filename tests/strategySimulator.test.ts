import { describe, expect, it } from 'vitest';
import { calculateStrategyPayoff } from '@/lib/engine/strategySimulator';
import { buildOptionChain, impliedVolForStrike, premiumForStrike } from '@/lib/engine/pricing';
import { getLotSize, getStrikeStep, roundToStrike } from '@/lib/types';
import type { OptionLeg, OptionType, UnderlyingSymbol } from '@/lib/types';

function leg(overrides: Partial<OptionLeg> & Pick<OptionLeg, 'type' | 'action' | 'strike'>): OptionLeg {
  return {
    id: Math.random().toString(36).slice(2),
    underlying: 'NIFTY',
    expiry: 'CURRENT',
    lots: 1,
    lotSize: getLotSize('NIFTY'),
    entryPrice: 100,
    iv: 15,
    ...overrides,
  };
}

const SPOT = 25000;

function payoff(legs: OptionLeg[], daysToExpiry = 4) {
  return calculateStrategyPayoff({ legs, spotPrice: SPOT, daysToExpiry });
}

describe('calculateStrategyPayoff', () => {
  it('returns an empty, non-crashing summary for no legs', () => {
    const result = calculateStrategyPayoff({ legs: [], spotPrice: SPOT, daysToExpiry: 4 });
    expect(result.payoffPoints).toHaveLength(0);
    expect(result.maxProfit).toBe(0);
    expect(result.probabilityOfProfit).toBe(0);
  });

  it('produces a monotonically increasing curve across the scanned range', () => {
    const points = payoff([
      leg({ type: 'CE', action: 'BUY', strike: 25000 }),
    ]).payoffPoints;
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.expiryPayoff).toBeGreaterThanOrEqual(points[i - 1]!.expiryPayoff);
    }
  });

  it('caps max loss at the debit for a long call', () => {
    const bought = leg({ type: 'CE', action: 'BUY', strike: 25000, entryPrice: 150 });
    const result = payoff([bought]);
    expect(result.maxLoss).toBe(150 * getLotSize('NIFTY'));
    expect(result.maxProfit).toBe('UNLIMITED');
  });

  it('caps max profit at the credit for a short call', () => {
    const sold = leg({ type: 'CE', action: 'SELL', strike: 25000, entryPrice: 150 });
    const result = payoff([sold]);
    expect(result.maxProfit).toBe(150 * getLotSize('NIFTY'));
    expect(result.maxLoss).toBe('UNLIMITED');
  });

  it('reports unlimited loss for a short strangle', () => {
    // The short 26000 call loses 1:1 with spot for ever, so the structure is
    // unbounded below even though the short put's gain saturates.
    const result = payoff([
      leg({ type: 'CE', action: 'SELL', strike: 26000, entryPrice: 60 }),
      leg({ type: 'PE', action: 'SELL', strike: 24000, entryPrice: 60 }),
    ]);
    expect(result.maxLoss).toBe('UNLIMITED');
    expect(result.maxProfit).toBe(120 * getLotSize('NIFTY'));
  });

  it('reports unlimited profit for a naked long call', () => {
    const result = payoff([leg({ type: 'CE', action: 'BUY', strike: 25000, entryPrice: 150 })]);
    expect(result.maxProfit).toBe('UNLIMITED');
    expect(result.maxLoss).toBe(150 * getLotSize('NIFTY'));
  });

  it('caps a long put, because spot cannot fall below zero', () => {
    // Best case is spot at zero, where the put is worth its full strike.
    const lot = getLotSize('NIFTY');
    const result = payoff([leg({ type: 'PE', action: 'BUY', strike: 24000, entryPrice: 60 })]);
    expect(result.maxProfit).toBe((24000 - 60) * lot);
    expect(result.maxLoss).toBe(60 * lot);
  });

  it('treats a short put struck at zero as capped, since spot cannot go below it', () => {
    const result = payoff([leg({ type: 'PE', action: 'SELL', strike: 0, entryPrice: 5 })]);
    expect(result.maxProfit).toBe(5 * getLotSize('NIFTY'));
    expect(result.maxLoss).toBe(0);
  });

  it('reports a bounded risk and reward for an iron condor', () => {
    const result = payoff([
      leg({ type: 'PE', action: 'BUY', strike: 23000, entryPrice: 20 }),
      leg({ type: 'PE', action: 'SELL', strike: 24000, entryPrice: 60 }),
      leg({ type: 'CE', action: 'SELL', strike: 26000, entryPrice: 60 }),
      leg({ type: 'CE', action: 'BUY', strike: 27000, entryPrice: 20 }),
    ]);
    expect(typeof result.maxProfit).toBe('number');
    expect(typeof result.maxLoss).toBe('number');
  });

  it('finds two breakevens for a short strangle', () => {
    const result = payoff([
      leg({ type: 'CE', action: 'SELL', strike: 26000, entryPrice: 60 }),
      leg({ type: 'PE', action: 'SELL', strike: 24000, entryPrice: 60 }),
    ]);
    expect(result.breakevens).toHaveLength(2);
    expect(result.breakevens[0]).toBeLessThan(SPOT);
    expect(result.breakevens[1]).toBeGreaterThan(SPOT);
  });

  it('reports a probability of profit inside 0-100', () => {
    const result = payoff([
      leg({ type: 'CE', action: 'SELL', strike: 26000, entryPrice: 60 }),
      leg({ type: 'PE', action: 'SELL', strike: 24000, entryPrice: 60 }),
    ]);
    expect(result.probabilityOfProfit).toBeGreaterThan(0);
    expect(result.probabilityOfProfit).toBeLessThan(100);
  });

  it('nets out greeks across opposing legs', () => {
    const long = payoff([leg({ type: 'CE', action: 'BUY', strike: 25000 })]);
    const short = payoff([leg({ type: 'CE', action: 'SELL', strike: 25000 })]);
    expect(long.netGreeks.delta).toBeCloseTo(-short.netGreeks.delta, 1);
    expect(long.netGreeks.vega).toBeCloseTo(-short.netGreeks.vega, 0);
  });

  it('gives a short option positive theta and a long option negative theta', () => {
    const shortTheta = payoff([leg({ type: 'CE', action: 'SELL', strike: 25000 })]).netGreeks.theta;
    const longTheta = payoff([leg({ type: 'CE', action: 'BUY', strike: 25000 })]).netGreeks.theta;
    expect(shortTheta).toBeGreaterThan(0);
    expect(longTheta).toBeLessThan(0);
  });

  it('estimates a larger margin for a naked short than for a debit spread', () => {
    const naked = payoff([leg({ type: 'CE', action: 'SELL', strike: 26000 })]).totalMarginEstimate;
    const spread = payoff([
      leg({ type: 'CE', action: 'SELL', strike: 26000, entryPrice: 60 }),
      leg({ type: 'CE', action: 'BUY', strike: 27000, entryPrice: 25 }),
    ]).totalMarginEstimate;
    expect(naked).toBeGreaterThan(spread);
  });

  it('treats a debit structure margin as the net premium paid', () => {
    const result = payoff([
      leg({ type: 'CE', action: 'BUY', strike: 25000, entryPrice: 150 }),
      leg({ type: 'PE', action: 'BUY', strike: 25000, entryPrice: 150 }),
    ]);
    expect(result.totalMarginEstimate).toBe(300 * getLotSize('NIFTY'));
  });

  it('keeps the forward curve different from the expiry curve', () => {
    const result = payoff([
      leg({ type: 'CE', action: 'SELL', strike: 26000, entryPrice: 60 }),
      leg({ type: 'PE', action: 'SELL', strike: 24000, entryPrice: 60 }),
    ]);
    const identical = result.payoffPoints.every(
      (p) => p.expiryPayoff === p.targetPayoff
    );
    expect(identical).toBe(false);
  });

  it('moves the forward curve when the IV shift is applied', () => {
    // A deep ITM leg is chosen because its premium is genuinely vega-driven;
    // a far OTM option is so cheap that an IV shift barely moves the number.
    const legs = [leg({ type: 'CE', action: 'BUY', strike: 24000, entryPrice: 900 })];
    const flat = calculateStrategyPayoff({ legs, spotPrice: SPOT, daysToExpiry: 4 });
    const crushed = calculateStrategyPayoff({
      legs,
      spotPrice: SPOT,
      daysToExpiry: 4,
      targetIvShiftPct: -5,
    });
    // An IV crush must reduce the value of a long option.
    expect(crushed.payoffPoints[60]!.targetPayoff).toBeLessThan(
      flat.payoffPoints[60]!.targetPayoff
    );
  });
});

describe('pricing consistency', () => {
  it('prices out-of-the-money puts above equivalent calls, reflecting positive skew', () => {
    // At the ATM strike calls sit above puts because r > q. The skew only
    // shows up away from the money, which is where crash hedging demand lives.
    const atmCall = premiumForStrike('NIFTY', 'CE', SPOT, SPOT, 4);
    const atmPut = premiumForStrike('NIFTY', 'PE', SPOT, SPOT, 4);
    expect(atmCall).toBeGreaterThan(atmPut);

    const otmCall = premiumForStrike('NIFTY', 'CE', SPOT + 400, SPOT, 4);
    const otmPut = premiumForStrike('NIFTY', 'PE', SPOT - 400, SPOT, 4);
    expect(otmPut).toBeGreaterThan(otmCall);
  });

  it('gives ATM calls and puts the same implied volatility', () => {
    expect(impliedVolForStrike('NIFTY', 'CE', SPOT, SPOT)).toBe(
      impliedVolForStrike('NIFTY', 'PE', SPOT, SPOT)
    );
  });

  it('puts more IV on far out-of-the-money puts than on ATM puts', () => {
    const atm = impliedVolForStrike('NIFTY', 'PE', SPOT, SPOT);
    const otm = impliedVolForStrike('NIFTY', 'PE', SPOT - 400, SPOT);
    expect(otm).toBeGreaterThan(atm);
  });

  it('agrees between the chain and the single-strike pricer', () => {
    const chain = buildOptionChain('NIFTY', SPOT, 4, 3);
    const row = chain.find((r) => r.strike === roundToStrike(SPOT, 'NIFTY'))!;
    const direct = premiumForStrike('NIFTY', 'CE', row.strike, SPOT, 4);
    // Both go through the same pricer, differing only by tick rounding.
    expect(Math.abs(row.CE.ltp - direct)).toBeLessThanOrEqual(0.05);
  });

  it('orders the chain by increasing strike', () => {
    const chain = buildOptionChain('NIFTY', SPOT, 4, 5);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i]!.strike).toBeGreaterThan(chain[i - 1]!.strike);
    }
  });

  it('prices calls downward and puts upward as strikes rise', () => {
    const chain = buildOptionChain('NIFTY', SPOT, 4, 5);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i]!.CE.ltp).toBeLessThanOrEqual(chain[i - 1]!.CE.ltp);
      expect(chain[i]!.PE.ltp).toBeGreaterThanOrEqual(chain[i - 1]!.PE.ltp);
    }
  });

  it('applies a strictly higher volatility to out-of-the-money puts than calls', () => {
    // This skew is what makes OTM puts bid above the parity price; the chain
    // deliberately violates strict put-call parity on both wings as a result.
    // Compared unrounded, because the chain publishes IV to one decimal.
    const atmStep = getStrikeStep('NIFTY');
    for (const distance of [1, 2, 4, 6]) {
      const put = impliedVolForStrike('NIFTY', 'PE', SPOT - distance * atmStep, SPOT);
      const call = impliedVolForStrike('NIFTY', 'CE', SPOT - distance * atmStep, SPOT);
      expect(put).toBeGreaterThan(call);
    }
    // Flat at the money, then rising with distance on both wings.
    expect(impliedVolForStrike('NIFTY', 'CE', SPOT, SPOT)).toBe(
      impliedVolForStrike('NIFTY', 'PE', SPOT, SPOT)
    );
    expect(impliedVolForStrike('NIFTY', 'PE', SPOT - 4 * atmStep, SPOT)).toBeGreaterThan(
      impliedVolForStrike('NIFTY', 'PE', SPOT, SPOT)
    );
  });

  it('forms a volatility smile that is lowest at the money and symmetric', () => {
    // IV is V-shaped around ATM and symmetric in strike distance, so the
    // published chain must fall towards the money and rise away from it.
    const chain = buildOptionChain('NIFTY', SPOT, 4, 6);
    const atmIndex = chain.findIndex((row) => row.strike === roundToStrike(SPOT, 'NIFTY'));

    for (const side of ['CE', 'PE'] as const) {
      const ivs = chain.map((row) => row[side].iv);
      expect(ivs[atmIndex]).toBe(15);
      for (let i = 1; i <= atmIndex; i += 1) {
        expect(ivs[atmIndex - i]!).toBeCloseTo(ivs[atmIndex + i]!, 1);
      }
    }
  });

  it('holds put-call parity at the money, where the smile is flat', () => {
    const r = 0.068;
    const q = 0.012;
    const t = 4 / 365;
    const atm = roundToStrike(SPOT, 'NIFTY');
    const chain = buildOptionChain('NIFTY', SPOT, 4, 3);
    const row = chain.find((entry) => entry.strike === atm)!;
    const parity = SPOT * Math.exp(-q * t) - atm * Math.exp(-r * t);
    expect(row.CE.ltp - row.PE.ltp).toBeCloseTo(parity, 0);
  });

  it('gives deltas in the expected range and signed puts', () => {
    const chain = buildOptionChain('NIFTY', SPOT, 4, 5);
    for (const row of chain) {
      expect(row.CE.delta).toBeGreaterThanOrEqual(0);
      expect(row.CE.delta).toBeLessThanOrEqual(1);
      expect(row.PE.delta).toBeLessThanOrEqual(0);
      expect(row.PE.delta).toBeGreaterThanOrEqual(-1);
    }
  });

  it('prices every contract in every underlying without error', () => {
    const symbols: UnderlyingSymbol[] = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];
    const types: OptionType[] = ['CE', 'PE'];
    for (const symbol of symbols) {
      for (const type of types) {
        const price = premiumForStrike(symbol, type, 100, 100, 3);
        expect(Number.isFinite(price)).toBe(true);
        expect(price).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('instrument specifications', () => {
  it('uses the published lot size for each index', () => {
    expect(getLotSize('NIFTY')).toBe(75);
    expect(getLotSize('BANKNIFTY')).toBe(30);
    expect(getLotSize('FINNIFTY')).toBe(65);
    expect(getLotSize('SENSEX')).toBe(20);
  });

  it('snaps to the exchange strike ladder', () => {
    expect(roundToStrike(25137, 'NIFTY') % 50).toBe(0);
    expect(roundToStrike(51637, 'BANKNIFTY') % 100).toBe(0);
    expect(roundToStrike(81777, 'SENSEX') % 100).toBe(0);
  });

  it('never falls back to a wrong lot size for a known symbol', () => {
    for (const symbol of ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'] as UnderlyingSymbol[]) {
      expect([75, 30, 65, 20]).toContain(getLotSize(symbol));
    }
  });
});
import { describe, expect, it } from 'vitest';
import {
  calculateBSPrice,
  calculateGreeks,
  normalCdf,
  normalPdf,
  solveImpliedVolatility,
} from '@/lib/engine/blackScholes';

describe('normalCdf', () => {
  it('matches known reference values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413447461, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.1586552539, 5);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021049, 5);
  });

  it('is symmetric about zero', () => {
    for (const x of [0.3, 1.1, 2.4]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 6);
    }
  });

  it('stays within bounds for extreme inputs', () => {
    expect(normalCdf(-50)).toBeGreaterThanOrEqual(0);
    expect(normalCdf(50)).toBeLessThanOrEqual(1);
  });
});

describe('normalPdf', () => {
  it('peaks at zero and is symmetric', () => {
    expect(normalPdf(0)).toBeCloseTo(0.3989422804, 7);
    expect(normalPdf(1)).toBeCloseTo(normalPdf(-1), 10);
  });
});

describe('calculateBSPrice', () => {
  const base = { s: 25000, k: 25000, r: 0.068, q: 0.012 };

  it('collapses to intrinsic value at expiry', () => {
    expect(calculateBSPrice({ ...base, t: 0, type: 'CE' })).toBe(0);
    expect(calculateBSPrice({ ...base, t: 0, k: 24000, type: 'CE' })).toBe(1000);
    expect(calculateBSPrice({ ...base, t: 0, k: 24000, type: 'PE' })).toBe(0);
    expect(calculateBSPrice({ ...base, t: 0, k: 26000, type: 'PE' })).toBe(1000);
  });

  it('prices an ATM 30-day Nifty call in the expected band', () => {
    // S=K=25000, T=30/365, r=6.8%, q=1.2%, sigma=15%.
    // Leading term ~0.4*S*sigma*sqrt(T) = 430, plus a small carry term, so ~490.
    const price = calculateBSPrice({ ...base, t: 30 / 365, sigma: 0.15, type: 'CE' });
    expect(price).toBeGreaterThan(450);
    expect(price).toBeLessThan(530);
  });

  it('satisfies put-call parity', () => {
    const params = { s: 25000, k: 24500, t: 20 / 365, r: 0.068, q: 0.012, sigma: 0.18 };
    const call = calculateBSPrice({ ...params, type: 'CE' });
    const put = calculateBSPrice({ ...params, type: 'PE' });
    const lhs = call - put;
    const rhs = params.s * Math.exp(-params.q * params.t) - params.k * Math.exp(-params.r * params.t);
    expect(lhs).toBeCloseTo(rhs, 4);
  });

  it('never prices below intrinsic value', () => {
    const call = calculateBSPrice({ ...base, t: 10 / 365, sigma: 0.02, type: 'CE', k: 20000 });
    expect(call).toBeGreaterThanOrEqual(5000);
  });

  it('is monotonically increasing in volatility for a call', () => {
    const vols = [0.05, 0.1, 0.15, 0.3, 0.6];
    const prices = vols.map((sigma) =>
      calculateBSPrice({ ...base, t: 7 / 365, sigma, type: 'CE' })
    );
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]!).toBeGreaterThan(prices[i - 1]!);
    }
  });

  it('is monotonically decreasing in strike for a call', () => {
    const strikes = [23000, 24000, 25000, 26000, 27000];
    const prices = strikes.map((k) =>
      calculateBSPrice({ ...base, k, t: 14 / 365, sigma: 0.2, type: 'CE' })
    );
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]!).toBeLessThan(prices[i - 1]!);
    }
  });
});

describe('calculateGreeks', () => {
  const params = { s: 25000, k: 25000, t: 7 / 365, r: 0.068, q: 0.012, sigma: 0.15 };

  it('returns zero greeks at expiry except delta', () => {
    // Deep ITM so the expiry delta is unambiguously 1.
    const g = calculateGreeks({ ...params, k: 20000, t: 0, type: 'CE' });
    expect(g.delta).toBe(1);
    expect(g.gamma).toBe(0);
    expect(g.vega).toBe(0);
    expect(g.theta).toBe(0);
  });

  it('gives an exactly-ATM option zero delta at expiry, where it is undefined', () => {
    const g = calculateGreeks({ ...params, t: 0, type: 'CE' });
    expect(g.delta).toBe(0);
  });

  it('gives an ATM call delta near 0.5 and positive gamma', () => {
    const g = calculateGreeks({ ...params, type: 'CE' });
    expect(g.delta).toBeGreaterThan(0.45);
    expect(g.delta).toBeLessThan(0.55);
    expect(g.gamma).toBeGreaterThan(0);
  });

  it('gives puts the mirrored delta', () => {
    const call = calculateGreeks({ ...params, type: 'CE' });
    const put = calculateGreeks({ ...params, type: 'PE' });
    // N(-x) from the A&S approximation is not the exact complement of N(x),
    // so allow the approximation's own tolerance here.
    expect(put.delta).toBeCloseTo(call.delta - 1, 3);
  });

  it('gives calls and puts identical gamma', () => {
    const call = calculateGreeks({ ...params, type: 'CE' });
    const put = calculateGreeks({ ...params, type: 'PE' });
    expect(call.gamma).toBeCloseTo(put.gamma, 12);
  });

  it('gives a positive buyer theta (decay) for a long option', () => {
    const call = calculateGreeks({ ...params, type: 'CE' });
    const put = calculateGreeks({ ...params, type: 'PE' });
    expect(call.theta).toBeLessThan(0);
    expect(put.theta).toBeLessThan(0);
  });

  it('scales vega with the square root of time to expiry', () => {
    // Near the money d1 is close to zero, so vega ~ S * sqrt(T) and therefore
    // grows with the time remaining. (It is *not* larger for shorter expiry.)
    const long = calculateGreeks({ ...params, t: 60 / 365, type: 'CE' }).vega;
    const short = calculateGreeks({ ...params, t: 7 / 365, type: 'CE' }).vega;
    expect(long).toBeGreaterThan(short);
    // 60d vs 7d is a sqrt(60/7) = 2.93x ratio.
    expect(long / short).toBeCloseTo(Math.sqrt(60 / 7), 1);
  });

  it('agrees with finite differences for delta', () => {
    const h = 1;
    const up = calculateBSPrice({ ...params, s: params.s + h, type: 'CE' });
    const down = calculateBSPrice({ ...params, s: params.s - h, type: 'CE' });
    const numeric = (up - down) / (2 * h);
    expect(calculateGreeks({ ...params, type: 'CE' }).delta).toBeCloseTo(numeric, 3);
  });

  it('agrees with finite differences for vega', () => {
    const h = 1e-4;
    const up = calculateBSPrice({ ...params, sigma: 0.15 + h, type: 'CE' });
    const down = calculateBSPrice({ ...params, sigma: 0.15 - h, type: 'CE' });
    // Vega is defined per 1 percentage point, i.e. 0.01 in sigma.
    const numeric = (up - down) / (2 * h) * 0.01;
    expect(calculateGreeks({ ...params, type: 'CE' }).vega).toBeCloseTo(numeric, 3);
  });
});

describe('solveImpliedVolatility', () => {
  const params = { s: 25000, k: 25000, t: 20 / 365, r: 0.068, q: 0.012, type: 'CE' as const };

  it('inverts the pricing function back to the input volatility', () => {
    for (const sigma of [0.05, 0.1, 0.15, 0.3, 0.6]) {
      const price = calculateBSPrice({ ...params, sigma });
      const solved = solveImpliedVolatility({ marketPrice: price, ...params });
      expect(solved).not.toBeNull();
      expect(solved!).toBeCloseTo(sigma, 4);
    }
  });

  it('inverts for puts too', () => {
    const price = calculateBSPrice({ ...params, sigma: 0.22, type: 'PE' });
    const solved = solveImpliedVolatility({ marketPrice: price, ...params, type: 'PE' });
    expect(solved).toBeCloseTo(0.22, 4);
  });

  it('returns null when the price is below intrinsic value', () => {
    // Intrinsic is 2000; asking for a 500 premium is an arbitrage violation.
    const solved = solveImpliedVolatility({
      marketPrice: 500,
      ...params,
      k: 23000,
    });
    expect(solved).toBeNull();
  });

  it('returns null for a non-positive price', () => {
    expect(solveImpliedVolatility({ marketPrice: 0, ...params })).toBeNull();
    expect(solveImpliedVolatility({ marketPrice: -10, ...params })).toBeNull();
  });

  it('recovers a high volatility for a deep ITM option where vega collapses', () => {
    const deep = { s: 25000, k: 20000, t: 5 / 365, r: 0.068, q: 0.012, type: 'CE' as const };
    const price = calculateBSPrice({ ...deep, sigma: 0.45 });
    const solved = solveImpliedVolatility({ marketPrice: price, ...deep });
    expect(solved).not.toBeNull();
    expect(solved!).toBeCloseTo(0.45, 2);
  });
});
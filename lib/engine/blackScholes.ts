import { type Greeks, type OptionType, TRADING_DAYS_PER_YEAR } from '../types';

/** Standard normal probability density function. */
export function normalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Cumulative normal distribution via the Abramowitz & Stegun 7.1.26
 * rational approximation. Absolute error is below 7.5e-8.
 */
export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * absX);
  const erf =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * erf);
}

const MIN_VOL = 1e-4;
const MIN_TIME = 1e-6;

export interface BlackScholesParams {
  /** Underlying spot. */
  s: number;
  /** Strike. */
  k: number;
  /** Time to expiry in years. */
  t: number;
  /** Risk-free rate as a fraction, e.g. 0.068 for 6.8%. */
  r?: number;
  /** Implied volatility as a fraction, e.g. 0.15 for 15%. */
  sigma?: number;
  type?: OptionType;
  /** Continuous dividend yield as a fraction. */
  q?: number;
}

/**
 * Black-Scholes-Merton European option price with continuous dividend yield.
 */
export function calculateBSPrice({
  s: S,
  k: K,
  t: T,
  r = 0.068,
  sigma,
  type = 'CE',
  q = 0.012,
}: BlackScholesParams): number {
  if (S <= 0 || K <= 0) return 0;

  // At (or effectively at) expiry the option is worth its intrinsic value.
  if (T <= MIN_TIME) {
    return type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  const vol = Math.max(MIN_VOL, sigma ?? 0.15);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const discountQ = Math.exp(-q * T);
  const discountR = Math.exp(-r * T);

  const price =
    type === 'CE'
      ? S * discountQ * normalCdf(d1) - K * discountR * normalCdf(d2)
      : K * discountR * normalCdf(-d2) - S * discountQ * normalCdf(-d1);

  // A violated no-arbitrage bound means no feasible volatility; floor at intrinsic.
  const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  return Math.max(intrinsic, price);
}

/**
 * Analytical greeks. Theta is expressed in rupees per calendar day and vega
 * and rho per 1 percentage-point move in their underlying driver.
 */
export function calculateGreeks({
  s: S,
  k: K,
  t: T,
  r = 0.068,
  sigma,
  type = 'CE',
  q = 0.012,
}: BlackScholesParams): Greeks {
  const zero: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

  if (S <= 0 || K <= 0) return zero;

  // Post-expiry greeks are discontinuous; intraday they are effectively zero.
  if (T <= MIN_TIME) {
    const itm = type === 'CE' ? S > K : K > S;
    return {
      delta: itm ? (type === 'CE' ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const vol = Math.max(MIN_VOL, sigma ?? 0.15);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  const pdfD1 = normalPdf(d1);
  const discountQ = Math.exp(-q * T);
  const discountR = Math.exp(-r * T);

  const delta =
    type === 'CE' ? discountQ * normalCdf(d1) : -discountQ * normalCdf(-d1);

  // Gamma is identical for calls and puts under Black-Scholes-Merton.
  const gamma = (discountQ * pdfD1) / (S * vol * sqrtT);

  const firstTerm = -(S * vol * discountQ * pdfD1) / (2 * sqrtT);
  const thetaYear =
    type === 'CE'
      ? firstTerm - r * K * discountR * normalCdf(d2) + q * S * discountQ * normalCdf(d1)
      : firstTerm + r * K * discountR * normalCdf(-d2) - q * S * discountQ * normalCdf(-d1);

  const vega = S * discountQ * sqrtT * pdfD1 * 0.01;

  const rho =
    type === 'CE' ? K * T * discountR * normalCdf(d2) * 0.01 : -K * T * discountR * normalCdf(-d2) * 0.01;

  return { delta, gamma, theta: thetaYear / TRADING_DAYS_PER_YEAR, vega, rho };
}

export interface ImpliedVolParams {
  /** Observed market premium. */
  marketPrice: number;
  s: number;
  k: number;
  /** Time to expiry in years. */
  t: number;
  r?: number;
  type?: OptionType;
  q?: number;
  /** Starting guess as a fraction. */
  initialGuess?: number;
  maxIterations?: number;
  tolerance?: number;
}

/**
 * Implied volatility via Newton-Raphson with a bisection fallback, so the
 * solver cannot return a non-converged guess for hard cases such as deep ITM
 * options where vega collapses.
 *
 * @returns Implied volatility as a fraction, or `null` when the price cannot
 * be reconciled with any volatility (e.g. below intrinsic).
 */
export function solveImpliedVolatility({
  marketPrice,
  s,
  k,
  t,
  r = 0.068,
  type = 'CE',
  q = 0.012,
  initialGuess = 0.2,
  maxIterations = 60,
  tolerance = 1e-6,
}: ImpliedVolParams): number | null {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || t <= 1e-6 || s <= 0 || k <= 0) {
    return null;
  }

  const intrinsic = type === 'CE' ? Math.max(0, s - k) : Math.max(0, k - s);
  // No arbitrage solution exists below intrinsic value.
  if (marketPrice < intrinsic - 1e-8) return null;

  const price = (sigma: number) =>
    calculateBSPrice({ s, k, t, r, sigma, type, q });

  let sigma = Math.min(Math.max(initialGuess, MIN_VOL), 5);
  const upperBound = 5;

  for (let i = 0; i < maxIterations; i += 1) {
    const diff = price(sigma) - marketPrice;
    if (Math.abs(diff) < tolerance) return sigma;

    const greeks = calculateGreeks({ s, k, t, r, sigma, type, q });
    // vega here is per 1% IV; convert to dPrice/dSigma.
    const vega = greeks.vega / 0.01;

    if (vega > 1e-8) {
      const next = sigma - diff / vega;
      if (Number.isFinite(next) && next > MIN_VOL && next < upperBound) {
        sigma = next;
        continue;
      }
    }

    // Vega too small to step: fall back to bisection on [sigma, upperBound].
    let lo = sigma;
    let hi = upperBound;
    for (let j = 0; j < maxIterations; j += 1) {
      const mid = (lo + hi) / 2;
      if (price(mid) > marketPrice) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }

  return sigma;
}
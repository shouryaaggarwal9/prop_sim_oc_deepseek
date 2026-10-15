import { OptionType, Greeks } from '../types';

/**
 * Standard Normal Probability Density Function (PDF)
 */
export function normalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Cumulative Normal Distribution Function (CDF) using Abramowitz and Stegun approximation
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
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * erf);
}

/**
 * Calculate Black-Scholes Option Price
 * @param S Current Underlying Spot Price
 * @param K Strike Price
 * @param T Time to expiry in years (e.g. 5 days = 5/365)
 * @param r Risk-free interest rate (e.g. 0.068 for 6.8%)
 * @param sigma Implied Volatility in decimal (e.g. 0.15 for 15%)
 * @param type 'CE' or 'PE'
 * @param q Dividend yield in decimal (default 0.012 for Nifty)
 */
export function calculateBSPrice(
  S: number,
  K: number,
  T: number,
  r: number = 0.068,
  sigma: number = 0.15,
  type: OptionType = 'CE',
  q: number = 0.012
): number {
  if (T <= 0.00001) {
    // At expiry
    return type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  if (sigma <= 0.0001) sigma = 0.0001;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (type === 'CE') {
    return S * Math.exp(-q * T) * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
  } else {
    return K * Math.exp(-r * T) * normalCdf(-d2) - S * Math.exp(-q * T) * normalCdf(-d1);
  }
}

/**
 * Calculate Analytical Option Greeks
 */
export function calculateGreeks(
  S: number,
  K: number,
  T: number,
  r: number = 0.068,
  sigma: number = 0.15,
  type: OptionType = 'CE',
  q: number = 0.012
): Greeks {
  if (T <= 0.00001) {
    const isITM = type === 'CE' ? S > K : K > S;
    return {
      delta: type === 'CE' ? (isITM ? 1 : 0) : (isITM ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  if (sigma <= 0.0001) sigma = 0.0001;

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const pdfD1 = normalPdf(d1);
  const discountQ = Math.exp(-q * T);
  const discountR = Math.exp(-r * T);

  // Delta
  let delta = 0;
  if (type === 'CE') {
    delta = discountQ * normalCdf(d1);
  } else {
    delta = -discountQ * normalCdf(-d1);
  }

  // Gamma (Identical for Call and Put)
  const gamma = (discountQ * pdfD1) / (S * sigma * sqrtT);

  // Theta (Per Calendar Day)
  let thetaYear = 0;
  const firstTerm = -(S * sigma * discountQ * pdfD1) / (2 * sqrtT);
  if (type === 'CE') {
    thetaYear = firstTerm - r * K * discountR * normalCdf(d2) + q * S * discountQ * normalCdf(d1);
  } else {
    thetaYear = firstTerm + r * K * discountR * normalCdf(-d2) - q * S * discountQ * normalCdf(-d1);
  }
  const theta = thetaYear / 365;

  // Vega (Per 1% change in IV = 0.01)
  const vega = (S * discountQ * sqrtT * pdfD1) * 0.01;

  // Rho (Per 1% change in Interest Rate)
  let rho = 0;
  if (type === 'CE') {
    rho = (K * T * discountR * normalCdf(d2)) * 0.01;
  } else {
    rho = (-K * T * discountR * normalCdf(-d2)) * 0.01;
  }

  return { delta, gamma, theta, vega, rho };
}

/**
 * Newton-Raphson Solver to calculate Implied Volatility from Market Price
 */
export function calculateImpliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number = 0.068,
  type: OptionType = 'CE',
  q: number = 0.012
): number {
  if (marketPrice <= 0 || T <= 0.0001) return 15; // default 15%

  const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  if (marketPrice < intrinsic) {
    return 5; // arbitrage floor
  }

  let sigma = 0.20; // 20% initial guess
  const maxIterations = 50;
  const tolerance = 0.0001;

  for (let i = 0; i < maxIterations; i++) {
    const price = calculateBSPrice(S, K, T, r, sigma, type, q);
    const diff = price - marketPrice;

    if (Math.abs(diff) < tolerance) {
      return sigma * 100; // Return in percentage e.g. 15.2
    }

    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const vega = S * Math.exp(-q * T) * sqrtT * normalPdf(d1);

    if (Math.abs(vega) < 1e-7) {
      break;
    }

    sigma = sigma - diff / vega;

    if (sigma <= 0.001) sigma = 0.001;
    if (sigma > 5.0) sigma = 5.0; // 500% cap
  }

  return Math.min(Math.max(sigma * 100, 1), 300);
}

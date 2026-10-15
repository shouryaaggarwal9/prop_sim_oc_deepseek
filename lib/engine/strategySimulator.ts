import { OptionLeg, StrategyPayoffSummary, PayoffPoint, Greeks } from '../types';
import { calculateBSPrice, calculateGreeks, normalCdf } from './blackScholes';

export interface PayoffCalculationOptions {
  legs: OptionLeg[];
  spotPrice: number;
  daysToExpiry: number;
  targetDaysRemaining?: number; // target simulation days, e.g. 2 days from now
  targetIvShiftPct?: number;   // e.g. +2% or -3%
  priceRangePct?: number;      // e.g. 0.10 for +/- 10%
  r?: number;
}

/**
 * Calculates complete Opstra-style Payoff diagram, Greeks, Breakevens, and Metrics
 */
export function calculateStrategyPayoff({
  legs,
  spotPrice,
  daysToExpiry,
  targetDaysRemaining,
  targetIvShiftPct = 0,
  priceRangePct = 0.08,
  r = 0.068,
}: PayoffCalculationOptions): StrategyPayoffSummary {
  if (legs.length === 0) {
    return {
      payoffPoints: [],
      maxProfit: 0,
      maxLoss: 0,
      riskRewardRatio: '0.00',
      breakevens: [],
      probabilityOfProfit: 0,
      netGreeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
      totalCost: 0,
      totalMarginEstimate: 0,
    };
  }

  const effectiveTargetDays = targetDaysRemaining !== undefined ? targetDaysRemaining : daysToExpiry;
  const targetT = Math.max(0.0001, effectiveTargetDays / 365);
  const expiryT = 0; // at expiry

  // Generate price grid
  const minPrice = Math.floor(spotPrice * (1 - priceRangePct));
  const maxPrice = Math.ceil(spotPrice * (1 + priceRangePct));
  const step = Math.max(10, Math.floor((maxPrice - minPrice) / 100));

  const payoffPoints: PayoffPoint[] = [];
  let minExpiryPnl = Infinity;
  let maxExpiryPnl = -Infinity;

  for (let p = minPrice; p <= maxPrice; p += step) {
    let expiryPnl = 0;
    let targetPnl = 0;

    for (const leg of legs) {
      const multiplier = leg.lots * leg.lotSize;
      const sign = leg.action === 'BUY' ? 1 : -1;

      // 1. Expiry P&L
      const intrinsic = leg.type === 'CE' ? Math.max(0, p - leg.strike) : Math.max(0, leg.strike - p);
      const legExpiryPnl = sign * (intrinsic - leg.entryPrice) * multiplier;
      expiryPnl += legExpiryPnl;

      // 2. Target Date P&L using Black-Scholes
      const effectiveIv = Math.max(0.01, (leg.iv + targetIvShiftPct) / 100);
      const theoreticalPrice = calculateBSPrice(p, leg.strike, targetT, r, effectiveIv, leg.type);
      const legTargetPnl = sign * (theoreticalPrice - leg.entryPrice) * multiplier;
      targetPnl += legTargetPnl;
    }

    if (expiryPnl < minExpiryPnl) minExpiryPnl = expiryPnl;
    if (expiryPnl > maxExpiryPnl) maxExpiryPnl = expiryPnl;

    payoffPoints.push({
      underlyingPrice: p,
      expiryPayoff: Math.round(expiryPnl),
      targetPayoff: Math.round(targetPnl),
    });
  }

  // Detect Breakeven points (where expiry curve crosses zero)
  const breakevens: number[] = [];
  for (let i = 1; i < payoffPoints.length; i++) {
    const prev = payoffPoints[i - 1];
    const curr = payoffPoints[i];

    if ((prev.expiryPayoff <= 0 && curr.expiryPayoff >= 0) || (prev.expiryPayoff >= 0 && curr.expiryPayoff <= 0)) {
      // Linear interpolation
      const slope = (curr.expiryPayoff - prev.expiryPayoff) / (curr.underlyingPrice - prev.underlyingPrice);
      if (slope !== 0) {
        const be = prev.underlyingPrice - prev.expiryPayoff / slope;
        breakevens.push(Math.round(be));
      }
    }
  }

  // Calculate Net Greeks
  const netGreeks: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  let totalCost = 0;
  let shortLegsCount = 0;
  let longLegsCount = 0;

  for (const leg of legs) {
    const multiplier = leg.lots * leg.lotSize;
    const sign = leg.action === 'BUY' ? 1 : -1;
    const T = Math.max(0.0001, daysToExpiry / 365);
    const legGreeks = calculateGreeks(spotPrice, leg.strike, T, r, leg.iv / 100, leg.type);

    netGreeks.delta += sign * legGreeks.delta * multiplier;
    netGreeks.gamma += sign * legGreeks.gamma * multiplier;
    netGreeks.theta += sign * legGreeks.theta * multiplier;
    netGreeks.vega += sign * legGreeks.vega * multiplier;
    netGreeks.rho += sign * legGreeks.rho * multiplier;

    totalCost += sign * leg.entryPrice * multiplier;

    if (leg.action === 'SELL') shortLegsCount += leg.lots;
    else longLegsCount += leg.lots;
  }

  // Probability of Profit (PoP) approximation using standard normal distribution over breakeven range
  let probabilityOfProfit = 50;
  if (breakevens.length === 2) {
    const [lowerBe, upperBe] = breakevens.sort((a, b) => a - b);
    const avgIv = legs.reduce((acc, l) => acc + l.iv, 0) / (legs.length || 1) / 100;
    const T = Math.max(0.001, daysToExpiry / 365);
    const d2Lower = (Math.log(spotPrice / lowerBe) + (r - 0.5 * avgIv * avgIv) * T) / (avgIv * Math.sqrt(T));
    const d2Upper = (Math.log(spotPrice / upperBe) + (r - 0.5 * avgIv * avgIv) * T) / (avgIv * Math.sqrt(T));

    const popCalc = Math.abs(normalCdf(d2Lower) - normalCdf(d2Upper)) * 100;
    // Check if middle is in profit or loss
    const middleIndex = Math.floor(payoffPoints.length / 2);
    const isCredit = payoffPoints[middleIndex].expiryPayoff > 0;
    probabilityOfProfit = isCredit ? popCalc : 100 - popCalc;
  } else if (breakevens.length === 1) {
    const be = breakevens[0];
    const isAboveBeProfit = payoffPoints[payoffPoints.length - 1].expiryPayoff > 0;
    const avgIv = (legs[0]?.iv || 15) / 100;
    const T = Math.max(0.001, daysToExpiry / 365);
    const d2 = (Math.log(spotPrice / be) + (r - 0.5 * avgIv * avgIv) * T) / (avgIv * Math.sqrt(T));
    const pop = normalCdf(d2) * 100;
    probabilityOfProfit = isAboveBeProfit ? pop : 100 - pop;
  }
  probabilityOfProfit = Math.min(99.9, Math.max(0.1, Number(probabilityOfProfit.toFixed(1))));

  // Max Profit / Max Loss
  const firstPoint = payoffPoints[0].expiryPayoff;
  const lastPoint = payoffPoints[payoffPoints.length - 1].expiryPayoff;
  const isLeftUnlimited = Math.abs(payoffPoints[1].expiryPayoff - payoffPoints[0].expiryPayoff) > 200;
  const isRightUnlimited = Math.abs(payoffPoints[payoffPoints.length - 1].expiryPayoff - payoffPoints[payoffPoints.length - 2].expiryPayoff) > 200;

  const maxProfit: number | 'UNLIMITED' = (isLeftUnlimited && firstPoint > 0) || (isRightUnlimited && lastPoint > 0)
    ? 'UNLIMITED'
    : Math.round(maxExpiryPnl);

  const maxLoss: number | 'UNLIMITED' = (isLeftUnlimited && firstPoint < 0) || (isRightUnlimited && lastPoint < 0)
    ? 'UNLIMITED'
    : Math.round(Math.abs(minExpiryPnl));

  let riskRewardRatio = '1 : 1';
  if (typeof maxProfit === 'number' && typeof maxLoss === 'number' && maxLoss > 0) {
    riskRewardRatio = `1 : ${(maxProfit / maxLoss).toFixed(2)}`;
  } else if (maxProfit === 'UNLIMITED') {
    riskRewardRatio = '1 : ∞';
  }

  // Margin estimate (SPAN + Exposure model)
  // Short option: ~₹1,15,000 per lot. Hedged spread: ~₹35,000 - ₹50,000 per lot.
  let totalMarginEstimate = 0;
  if (shortLegsCount > 0) {
    const hedgedCount = Math.min(shortLegsCount, longLegsCount);
    const nakedCount = Math.max(0, shortLegsCount - longLegsCount);
    totalMarginEstimate = hedgedCount * 45000 + nakedCount * 115000;
  } else {
    // Net buyers only pay premium
    totalMarginEstimate = Math.max(0, totalCost);
  }

  return {
    payoffPoints,
    maxProfit,
    maxLoss,
    riskRewardRatio,
    breakevens,
    probabilityOfProfit,
    netGreeks: {
      delta: Number(netGreeks.delta.toFixed(3)),
      gamma: Number(netGreeks.gamma.toFixed(5)),
      theta: Math.round(netGreeks.theta),
      vega: Math.round(netGreeks.vega),
      rho: Math.round(netGreeks.rho),
    },
    totalCost: Math.round(totalCost),
    totalMarginEstimate: Math.round(totalMarginEstimate),
  };
}

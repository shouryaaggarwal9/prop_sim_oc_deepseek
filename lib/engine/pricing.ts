import {
  type InstrumentSpec,
  type OptionType,
  type UnderlyingSymbol,
  RISK_FREE_RATE,
  TRADING_DAYS_PER_YEAR,
  getInstrument,
} from '../types';
import { calculateBSPrice, calculateGreeks, solveImpliedVolatility } from './blackScholes';

/**
 * Options carry a volatility smile: out-of-the-money puts trade at a higher
 * implied volatility than at-the-money, reflecting crash hedging demand.
 *
 * `moneyness` is 0 at the ATM strike, 1 two strikes OTM, and so on.
 */
const PUT_SKEW_IV_PER_STRIKE = 0.35;
const CALL_SMILE_IV_PER_STRIKE = 0.15;

export function atmImpliedVol(symbol: UnderlyingSymbol): number {
  return getInstrument(symbol).atmIv;
}

/**
 * Smile-consistent implied volatility for a strike, expressed in percent.
 * This is the only place an IV is derived, so the chain, the payoff engine and
 * the strategy presets can never disagree about the price of the same contract.
 */
export function impliedVolForStrike(
  symbol: UnderlyingSymbol,
  type: OptionType,
  strike: number,
  spot: number
): number {
  const { strikeStep, atmIv } = getInstrument(symbol);
  const distance = Math.abs(strike - spot) / strikeStep;
  const slope = type === 'PE' ? PUT_SKEW_IV_PER_STRIKE : CALL_SMILE_IV_PER_STRIKE;
  return Math.max(1, atmIv + distance * slope);
}

/** Black-Scholes premium for a contract, honouring the smile. */
export function premiumForStrike(
  symbol: UnderlyingSymbol,
  type: OptionType,
  strike: number,
  spot: number,
  daysToExpiry: number,
  ivShiftPct = 0
): number {
  const instrument = getInstrument(symbol);
  const iv = impliedVolForStrike(symbol, type, strike, spot) + ivShiftPct;
  const t = Math.max(0, daysToExpiry) / TRADING_DAYS_PER_YEAR;
  return calculateBSPrice({
    s: spot,
    k: strike,
    t,
    r: RISK_FREE_RATE,
    sigma: iv / 100,
    type,
    q: instrument.dividendYield,
  });
}

export interface OptionChainRow {
  strike: number;
  CE: {
    strike: number;
    ltp: number;
    iv: number;
    delta: number;
    openInterest: number;
  };
  PE: {
    strike: number;
    ltp: number;
    iv: number;
    delta: number;
    openInterest: number;
  };
}

/**
 * Deterministic synthetic option chain. Open interest is modelled as a peak at
 * the ATM decaying with distance, which is sufficient for margin and payoff
 * work but is explicitly *not* a live feed.
 */
export function buildOptionChain(
  symbol: UnderlyingSymbol,
  spot: number,
  daysToExpiry: number,
  strikeCount = 11
): OptionChainRow[] {
  const instrument: InstrumentSpec = getInstrument(symbol);
  const atmStrike = Math.round(spot / instrument.strikeStep) * instrument.strikeStep;
  const rows: OptionChainRow[] = [];

  for (let i = -strikeCount; i <= strikeCount; i += 1) {
    const strike = atmStrike + i * instrument.strikeStep;

    const ceIv = impliedVolForStrike(symbol, 'CE', strike, spot);
    const peIv = impliedVolForStrike(symbol, 'PE', strike, spot);

    const t = Math.max(0, daysToExpiry) / TRADING_DAYS_PER_YEAR;
    const ceGreeks = calculateGreeks({
      s: spot,
      k: strike,
      t,
      r: RISK_FREE_RATE,
      sigma: ceIv / 100,
      type: 'CE',
      q: instrument.dividendYield,
    });
    const peGreeks = calculateGreeks({
      s: spot,
      k: strike,
      t,
      r: RISK_FREE_RATE,
      sigma: peIv / 100,
      type: 'PE',
      q: instrument.dividendYield,
    });

    // Open interest concentrates near the money; calls add on the upside, puts on the downside.
    const baseOi = Math.max(5000, 150000 - Math.abs(i) * 9000);
    const ceOi = baseOi + (i > 0 ? 30000 : -10000);
    const peOi = baseOi + (i < 0 ? 35000 : -15000);

    rows.push({
      strike,
      CE: {
        strike,
        ltp: roundToTick(
          premiumForStrike(symbol, 'CE', strike, spot, daysToExpiry)
        ),
        iv: Number(ceIv.toFixed(1)),
        delta: Number(ceGreeks.delta.toFixed(2)),
        openInterest: ceOi,
      },
      PE: {
        strike,
        ltp: roundToTick(
          premiumForStrike(symbol, 'PE', strike, spot, daysToExpiry)
        ),
        iv: Number(peIv.toFixed(1)),
        delta: Number(peGreeks.delta.toFixed(2)),
        openInterest: peOi,
      },
    });
  }

  return rows;
}

/** NSE/BSE quote increments are ₹0.05 for most option premiums. */
export function roundToTick(price: number): number {
  return Math.max(0.05, Math.round(price / 0.05) * 0.05);
}

/**
 * Recovers the implied volatility implied by an observed premium, so a leg
 * entered by hand gets greeks that match the price actually paid.
 *
 * @returns Implied volatility in percent, or `null` when the price is
 * inconsistent with any volatility (e.g. below intrinsic value).
 */
export function solveImpliedVol(
  marketPrice: number,
  symbol: UnderlyingSymbol,
  type: OptionType,
  strike: number,
  spot: number,
  daysToExpiry: number
): number | null {
  const instrument = getInstrument(symbol);
  const sigma = solveImpliedVolatility({
    marketPrice,
    s: spot,
    k: strike,
    t: daysToExpiry / TRADING_DAYS_PER_YEAR,
    r: RISK_FREE_RATE,
    type,
    q: instrument.dividendYield,
  });
  return sigma === null ? null : Number((sigma * 100).toFixed(2));
}
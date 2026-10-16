import { type IndianCharges, type OrderAction } from '../types';

/**
 * Indian F&O statutory cost model.
 *
 * Rates below reflect the position after 1 October 2024, when SEBI's IPFT
 * (₹450 per crore) was folded into the exchange transaction charge and is no
 * longer levied separately. Exchange authorities revise these periodically;
 * re-verify against the latest circular before each release.
 */
export const CHARGE_RATES = {
  /** STT on options premium: 0.0625%, sell side only. */
  sttSellRate: 0.000625,
  /** Exchange transaction charge on premium turnover, NSE. */
  exchangeRateNse: 0.0005,
  /** Exchange transaction charge on premium turnover, BSE. */
  exchangeRateBse: 0.000375,
  /** SEBI turnover fee: ₹10 per crore. */
  sebiRate: 0.000001,
  /** Stamp duty on options premium: 0.003%, buy side only. */
  stampDutyBuyRate: 0.00003,
  /** GST applies to brokerage + exchange charges + SEBI fees. */
  gstRate: 0.18,
} as const;

export interface TaxCalculationParams {
  action: OrderAction;
  /** Premium per unit in rupees. */
  price: number;
  /** Number of units. */
  qty: number;
  /** Flat brokerage per order in rupees. Use 0 for zero-brokerage models. */
  brokeragePerOrder?: number;
  /** BSE charges a marginally lower exchange rate than NSE. */
  isBse?: boolean;
}

/**
 * Itemised statutory cost for a single options order (one side of a trade).
 */
export function calculateIndianCharges({
  action,
  price,
  qty,
  brokeragePerOrder = 20,
  isBse = false,
}: TaxCalculationParams): IndianCharges {
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const safeQty = Number.isFinite(qty) ? Math.max(0, qty) : 0;
  const safeBrokerage = Number.isFinite(brokeragePerOrder) ? Math.max(0, brokeragePerOrder) : 0;

  const premiumTurnover = safePrice * safeQty;

  const brokerage = safeBrokerage;
  const stt = action === 'SELL' ? premiumTurnover * CHARGE_RATES.sttSellRate : 0;
  const exchangeTurnover =
    premiumTurnover * (isBse ? CHARGE_RATES.exchangeRateBse : CHARGE_RATES.exchangeRateNse);
  const sebiCharges = premiumTurnover * CHARGE_RATES.sebiRate;
  const stampDuty = action === 'BUY' ? premiumTurnover * CHARGE_RATES.stampDutyBuyRate : 0;
  const gst = (brokerage + exchangeTurnover + sebiCharges) * CHARGE_RATES.gstRate;

  const totalCharges =
    brokerage + stt + exchangeTurnover + sebiCharges + stampDuty + gst;

  return {
    stt: round2(stt),
    exchangeTurnover: round2(exchangeTurnover),
    sebiCharges: round2(sebiCharges),
    stampDuty: round2(stampDuty),
    gst: round2(gst),
    brokerage: round2(brokerage),
    totalCharges: round2(totalCharges),
  };
}

export interface RoundTripParams extends Omit<TaxCalculationParams, 'action'> {
  brokeragePerOrder?: number;
  isBse?: boolean;
}

/**
 * Combined cost of opening and closing a position, which is what actually
 * determines the breakeven move.
 */
export function calculateRoundTripCharges(params: RoundTripParams): IndianCharges {
  const entry = calculateIndianCharges({ ...params, action: 'BUY' });
  const exit = calculateIndianCharges({ ...params, action: 'SELL' });

  return {
    stt: round2(entry.stt + exit.stt),
    exchangeTurnover: round2(entry.exchangeTurnover + exit.exchangeTurnover),
    sebiCharges: round2(entry.sebiCharges + exit.sebiCharges),
    stampDuty: round2(entry.stampDuty + exit.stampDuty),
    gst: round2(entry.gst + exit.gst),
    brokerage: round2(entry.brokerage + exit.brokerage),
    totalCharges: round2(entry.totalCharges + exit.totalCharges),
  };
}

/**
 * Premium points a position must move to clear its round-trip costs.
 */
export function breakevenPoints(params: RoundTripParams): number {
  const qty = Number.isFinite(params.qty) ? Math.max(0, params.qty) : 0;
  if (qty <= 0) return 0;
  return calculateRoundTripCharges(params).totalCharges / qty;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
import { IndianCharges, OrderAction } from '../types';

export interface TaxCalculationParams {
  action: OrderAction;
  price: number;
  qty: number;
  brokeragePerOrder?: number;
  isBse?: boolean;
}

/**
 * Calculate Indian SEBI / NSE F&O Regulatory Charges and Taxes
 */
export function calculateIndianCharges({
  action,
  price,
  qty,
  brokeragePerOrder = 20,
  isBse = false,
}: TaxCalculationParams): IndianCharges {
  const premiumTurnover = price * qty;

  // 1. Brokerage
  const brokerage = brokeragePerOrder;

  // 2. STT (Securities Transaction Tax) - 0.0625% on Sell side only
  const stt = action === 'SELL' ? premiumTurnover * 0.000625 : 0;

  // 3. Exchange Transaction Charges - NSE: 0.05% (0.0005) or BSE: 0.0375% (0.000375)
  const exchangeRate = isBse ? 0.000375 : 0.0005;
  const exchangeTurnover = premiumTurnover * exchangeRate;

  // 4. SEBI Turnover Charges - ₹10 per crore (0.000001)
  const sebiCharges = premiumTurnover * 0.000001;

  // 5. Stamp Duty - 0.003% (0.00003) on Buy side only
  const stampDuty = action === 'BUY' ? premiumTurnover * 0.00003 : 0;

  // 6. GST - 18% on (Brokerage + Exchange Charges + SEBI Charges)
  const gst = (brokerage + exchangeTurnover + sebiCharges) * 0.18;

  const totalCharges = brokerage + stt + exchangeTurnover + sebiCharges + stampDuty + gst;

  return {
    stt: Number(stt.toFixed(2)),
    exchangeTurnover: Number(exchangeTurnover.toFixed(2)),
    sebiCharges: Number(sebiCharges.toFixed(2)),
    stampDuty: Number(stampDuty.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    brokerage: Number(brokerage.toFixed(2)),
    totalCharges: Number(totalCharges.toFixed(2)),
  };
}

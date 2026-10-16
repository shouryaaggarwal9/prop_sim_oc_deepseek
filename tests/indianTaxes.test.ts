import { describe, expect, it } from 'vitest';
import {
  CHARGE_RATES,
  breakevenPoints,
  calculateIndianCharges,
  calculateRoundTripCharges,
} from '@/lib/engine/indianTaxes';

describe('calculateIndianCharges', () => {
  const SELL_120_X_100 = calculateIndianCharges({ action: 'SELL', price: 120, qty: 100 });

  it('computes STT at 0.0625% of premium on the sell side only', () => {
    expect(SELL_120_X_100.stt).toBeCloseTo(12000 * 0.000625, 2);
    const buy = calculateIndianCharges({ action: 'BUY', price: 120, qty: 100 });
    expect(buy.stt).toBe(0);
  });

  it('computes exchange turnover on premium, not on the underlying', () => {
    expect(SELL_120_X_100.exchangeTurnover).toBeCloseTo(12000 * CHARGE_RATES.exchangeRateNse, 2);
    const bse = calculateIndianCharges({ action: 'SELL', price: 120, qty: 100, isBse: true });
    expect(bse.exchangeTurnover).toBeCloseTo(12000 * CHARGE_RATES.exchangeRateBse, 2);
    expect(bse.exchangeTurnover).toBeLessThan(SELL_120_X_100.exchangeTurnover);
  });

  it('computes SEBI turnover fee at 10 rupees per crore', () => {
    // On a 12,000 turnover the exact fee is 0.012, which the engine rounds to
    // the nearest paisa. Use a turnover where the fee is unambiguous.
    expect(SELL_120_X_100.sebiCharges).toBe(0.01);
    const large = calculateIndianCharges({ action: 'SELL', price: 1000, qty: 750 });
    expect(large.sebiCharges).toBe(0.75);
  });

  it('computes stamp duty at 0.003% on the buy side only', () => {
    const buy = calculateIndianCharges({ action: 'BUY', price: 120, qty: 100 });
    expect(buy.stampDuty).toBeCloseTo(12000 * CHARGE_RATES.stampDutyBuyRate, 3);
    expect(SELL_120_X_100.stampDuty).toBe(0);
  });

  it('applies 18% GST to brokerage plus exchange plus SEBI only', () => {
    const expected =
      (20 + SELL_120_X_100.exchangeTurnover + SELL_120_X_100.sebiCharges) * CHARGE_RATES.gstRate;
    expect(SELL_120_X_100.gst).toBeCloseTo(expected, 2);
  });

  it('matches the hand-checked total for a sell of 120 x 100', () => {
    // Turnover 12000: STT 7.50, exchange 6.00, SEBI 0.01, stamp 0, brokerage 20, GST 4.68.
    expect(SELL_120_X_100.stt).toBe(7.5);
    expect(SELL_120_X_100.exchangeTurnover).toBe(6);
    expect(SELL_120_X_100.brokerage).toBe(20);
    expect(SELL_120_X_100.gst).toBeCloseTo(4.68, 2);
    expect(SELL_120_X_100.totalCharges).toBeCloseTo(38.19, 2);
  });

  it('sums the itemised components into the total', () => {
    for (const action of ['BUY', 'SELL'] as const) {
      const c = calculateIndianCharges({ action, price: 87.65, qty: 75 });
      const sum =
        c.stt + c.exchangeTurnover + c.sebiCharges + c.stampDuty + c.gst + c.brokerage;
      expect(c.totalCharges).toBeCloseTo(sum, 1);
    }
  });

  it('supports zero-brokerage models', () => {
    const free = calculateIndianCharges({ action: 'SELL', price: 120, qty: 100, brokeragePerOrder: 0 });
    expect(free.brokerage).toBe(0);
    expect(free.gst).toBeCloseTo(
      (free.exchangeTurnover + free.sebiCharges) * CHARGE_RATES.gstRate,
      2
    );
  });

  it('never returns negative or non-finite values for hostile input', () => {
    const hostile = calculateIndianCharges({
      action: 'SELL',
      price: Number.NaN,
      qty: Number.POSITIVE_INFINITY,
      brokeragePerOrder: -50,
    });
    for (const value of Object.values(hostile)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns all zeros for a zero-value order', () => {
    const c = calculateIndianCharges({ action: 'SELL', price: 0, qty: 0, brokeragePerOrder: 0 });
    expect(c.totalCharges).toBe(0);
  });
});

describe('calculateRoundTripCharges', () => {
  it('equals the sum of the buy and sell sides at the same price', () => {
    const buy = calculateIndianCharges({ action: 'BUY', price: 150, qty: 75 });
    const sell = calculateIndianCharges({ action: 'SELL', price: 150, qty: 75 });
    const round = calculateRoundTripCharges({ price: 150, qty: 75 });
    expect(round.stt).toBeCloseTo(buy.stt + sell.stt, 1);
    expect(round.exchangeTurnover).toBeCloseTo(buy.exchangeTurnover + sell.exchangeTurnover, 1);
    expect(round.stampDuty).toBeCloseTo(buy.stampDuty + sell.stampDuty, 3);
    expect(round.brokerage).toBe(buy.brokerage + sell.brokerage);
    expect(round.totalCharges).toBeCloseTo(buy.totalCharges + sell.totalCharges, 1);
  });

  it('charges STT exactly once, on the sell side', () => {
    const round = calculateRoundTripCharges({ price: 120, qty: 100 });
    const sellOnly = calculateIndianCharges({ action: 'SELL', price: 120, qty: 100 });
    const buyOnly = calculateIndianCharges({ action: 'BUY', price: 120, qty: 100 });
    expect(round.stt).toBeCloseTo(sellOnly.stt + buyOnly.stt, 2);
    expect(round.stt).toBeCloseTo(sellOnly.stt, 2);
  });
});

describe('breakevenPoints', () => {
  it('returns total round-trip cost divided by quantity', () => {
    const points = breakevenPoints({ price: 120, qty: 100 });
    const charges = calculateRoundTripCharges({ price: 120, qty: 100 });
    expect(points).toBeCloseTo(charges.totalCharges / 100, 4);
  });

  it('is zero for a zero-size order', () => {
    expect(breakevenPoints({ price: 120, qty: 0 })).toBe(0);
  });

  it('is strictly greater than the one-way cost per unit', () => {
    const oneWay = calculateIndianCharges({ action: 'SELL', price: 120, qty: 100 });
    expect(breakevenPoints({ price: 120, qty: 100 })).toBeGreaterThan(oneWay.totalCharges / 100);
  });
});
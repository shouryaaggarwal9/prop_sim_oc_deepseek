import { NextRequest, NextResponse } from 'next/server';
import { calculateBSPrice, calculateGreeks } from '@/lib/engine/blackScholes';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const underlying = searchParams.get('underlying') || 'NIFTY';

  const baseConfig: Record<string, { spot: number; strikeStep: number; expiry: string; daysToExpiry: number }> = {
    NIFTY: { spot: 25050, strikeStep: 50, expiry: '24-OCT-2024', daysToExpiry: 4 },
    BANKNIFTY: { spot: 51600, strikeStep: 100, expiry: '23-OCT-2024', daysToExpiry: 3 },
    FINNIFTY: { spot: 23400, strikeStep: 50, expiry: '22-OCT-2024', daysToExpiry: 2 },
    SENSEX: { spot: 81800, strikeStep: 100, expiry: '25-OCT-2024', daysToExpiry: 5 },
  };

  const config = baseConfig[underlying.toUpperCase()] || baseConfig.NIFTY;
  const spot = config.spot;
  const step = config.strikeStep;
  const atmStrike = Math.round(spot / step) * step;

  // Generate 11 strikes above and below ATM
  const strikeCount = 11;
  const records = [];

  for (let i = -strikeCount; i <= strikeCount; i++) {
    const strike = atmStrike + i * step;
    const t = Math.max(0.001, config.daysToExpiry / 365);
    const ivCe = 14.5 + Math.abs(i) * 0.2;
    const ivPe = 15.2 + Math.abs(i) * 0.25;

    const ceLtp = Math.max(0.5, Math.round(calculateBSPrice(spot, strike, t, 0.068, ivCe / 100, 'CE') * 10) / 10);
    const peLtp = Math.max(0.5, Math.round(calculateBSPrice(spot, strike, t, 0.068, ivPe / 100, 'PE') * 10) / 10);

    const ceGreeks = calculateGreeks(spot, strike, t, 0.068, ivCe / 100, 'CE');
    const peGreeks = calculateGreeks(spot, strike, t, 0.068, ivPe / 100, 'PE');

    // Synthetic Open Interest distribution (highest near ATM)
    const baseOi = Math.max(5000, Math.floor(150000 - Math.abs(i) * 9000));
    const ceOi = baseOi + (i > 0 ? 30000 : -10000);
    const peOi = baseOi + (i < 0 ? 35000 : -15000);

    records.push({
      strikePrice: strike,
      CE: {
        strikePrice: strike,
        ltp: ceLtp,
        iv: Number(ivCe.toFixed(1)),
        openInterest: ceOi,
        changeinOpenInterest: Math.floor(ceOi * 0.12),
        totalTradedVolume: Math.floor(ceOi * 1.8),
        delta: Number(ceGreeks.delta.toFixed(2)),
      },
      PE: {
        strikePrice: strike,
        ltp: peLtp,
        iv: Number(ivPe.toFixed(1)),
        openInterest: peOi,
        changeinOpenInterest: Math.floor(peOi * 0.14),
        totalTradedVolume: Math.floor(peOi * 1.6),
        delta: Number(peGreeks.delta.toFixed(2)),
      },
    });
  }

  return NextResponse.json({
    underlying,
    spotPrice: spot,
    atmStrike,
    expiry: config.expiry,
    daysToExpiry: config.daysToExpiry,
    data: records,
  });
}

'use client';

import React, { useState } from 'react';
import { calculateIndianCharges } from '@/lib/engine/indianTaxes';
import { formatINR } from '@/lib/utils';
import { Calculator, HelpCircle, ShieldCheck } from 'lucide-react';
import { OrderAction } from '@/lib/types';

export const TaxCalculatorView: React.FC = () => {
  const [action, setAction] = useState<OrderAction>('SELL');
  const [price, setPrice] = useState<number>(120);
  const [qty, setQty] = useState<number>(100); // 2 lots of Nifty
  const [brokeragePerOrder, setBrokeragePerOrder] = useState<number>(20);
  const [isBse, setIsBse] = useState<boolean>(false);

  const charges = calculateIndianCharges({
    action,
    price,
    qty,
    brokeragePerOrder,
    isBse,
  });

  const premiumTurnover = price * qty;
  const breakevenPoints = qty > 0 ? charges.totalCharges / qty : 0;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Calculator className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="font-semibold text-sm text-white">Indian SEBI / NSE F&O Regulatory Cost Engine</h3>
            <p className="text-xs text-slate-400">
              Calculate exact statutory friction (STT, GST, Exchange charges, Stamp Duty) for options trading in India.
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Order Action</label>
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setAction('BUY')}
                className={`w-1/2 py-1 font-semibold rounded text-center ${
                  action === 'BUY' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setAction('SELL')}
                className={`w-1/2 py-1 font-semibold rounded text-center ${
                  action === 'SELL' ? 'bg-rose-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                SELL
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Option Premium (₹)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Math.max(0.1, Number(e.target.value)))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Quantity (Units)</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Brokerage Model</label>
            <select
              value={brokeragePerOrder}
              onChange={(e) => setBrokeragePerOrder(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value={20}>Standard Discount Broker (₹20/order)</option>
              <option value={0}>Shoonya Zero Brokerage (₹0/order)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Exchange</label>
            <select
              value={isBse ? 'BSE' : 'NSE'}
              onChange={(e) => setIsBse(e.target.value === 'BSE')}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value="NSE">NSE (0.05% Premium)</option>
              <option value="BSE">BSE (0.0375% Premium)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tax Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (8 Cols): Detailed Items */}
        <div className="lg:col-span-8 p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <h4 className="font-semibold text-xs text-white uppercase tracking-wider">Itemized Regulatory Breakdown</h4>

          <div className="divide-y divide-slate-800/80 text-xs font-mono">
            <div className="py-2.5 flex justify-between items-center">
              <div>
                <span className="text-white font-sans font-medium">Securities Transaction Tax (STT)</span>
                <span className="text-[11px] text-slate-500 font-sans block">
                  0.0625% on Sell Premium only (Zero on Buy)
                </span>
              </div>
              <span className="text-slate-200">₹{charges.stt.toFixed(2)}</span>
            </div>

            <div className="py-2.5 flex justify-between items-center">
              <div>
                <span className="text-white font-sans font-medium">Exchange Turnover Charges</span>
                <span className="text-[11px] text-slate-500 font-sans block">
                  {isBse ? 'BSE: 0.0375%' : 'NSE: 0.050%'} on premium turnover
                </span>
              </div>
              <span className="text-slate-200">₹{charges.exchangeTurnover.toFixed(2)}</span>
            </div>

            <div className="py-2.5 flex justify-between items-center">
              <div>
                <span className="text-white font-sans font-medium">GST (Goods and Services Tax)</span>
                <span className="text-[11px] text-slate-500 font-sans block">
                  18% on (Brokerage + Exchange Charges + SEBI)
                </span>
              </div>
              <span className="text-slate-200">₹{charges.gst.toFixed(2)}</span>
            </div>

            <div className="py-2.5 flex justify-between items-center">
              <div>
                <span className="text-white font-sans font-medium">SEBI Turnover Charges</span>
                <span className="text-[11px] text-slate-500 font-sans block">₹10 per crore (0.0001%)</span>
              </div>
              <span className="text-slate-200">₹{charges.sebiCharges.toFixed(2)}</span>
            </div>

            <div className="py-2.5 flex justify-between items-center">
              <div>
                <span className="text-white font-sans font-medium">Stamp Duty</span>
                <span className="text-[11px] text-slate-500 font-sans block">
                  0.003% on Buy side only (Zero on Sell)
                </span>
              </div>
              <span className="text-slate-200">₹{charges.stampDuty.toFixed(2)}</span>
            </div>

            <div className="py-2.5 flex justify-between items-center">
              <div>
                <span className="text-white font-sans font-medium">Brokerage</span>
                <span className="text-[11px] text-slate-500 font-sans block">Execution fee</span>
              </div>
              <span className="text-slate-200">₹{charges.brokerage.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Right (4 Cols): Total & Breakeven Point */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div>
              <span className="text-xs text-slate-400 block">Total Premium Turnover</span>
              <span className="text-xl font-bold font-mono text-white">{formatINR(premiumTurnover)}</span>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <span className="text-xs text-slate-400 block">Total Friction Charges</span>
              <span className="text-2xl font-bold font-mono text-rose-400">
                ₹{charges.totalCharges.toFixed(2)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 block">Breakeven Points Required:</span>
              <span className="text-base font-bold font-mono text-cyan-400">
                +{breakevenPoints.toFixed(2)} pts
              </span>
              <span className="text-[10px] text-slate-500 block">
                The option must move by this much just to cover regulatory taxes & brokerage.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

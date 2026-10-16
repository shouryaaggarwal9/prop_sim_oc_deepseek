'use client';

import { useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import { CHARGE_RATES, breakevenPoints, calculateIndianCharges, calculateRoundTripCharges } from '@/lib/engine/indianTaxes';
import type { OrderAction } from '@/lib/types';
import { cn, formatINR } from '@/lib/utils';

export function TaxCalculatorView() {
  const [action, setAction] = useState<OrderAction>('SELL');
  const [price, setPrice] = useState(120);
  const [qty, setQty] = useState(100);
  const [brokeragePerOrder, setBrokeragePerOrder] = useState(20);
  const [isBse, setIsBse] = useState(false);

  const oneWay = calculateIndianCharges({ action, price, qty, brokeragePerOrder, isBse });
  const roundTrip = calculateRoundTripCharges({ price, qty, brokeragePerOrder, isBse });
  const premiumTurnover = price * qty;
  const bePoints = breakevenPoints({ price, qty, brokeragePerOrder, isBse });

  return (
    <div className="space-y-6">
      <section className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Calculator className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-sm text-white">Indian F&amp;O Regulatory Cost Engine</h3>
            <p className="text-xs text-slate-400">
              Itemised statutory friction for index options trading.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <span id="tax-action-label" className="text-[11px] text-slate-400 block mb-1">
              Order Action
            </span>
            <div
              role="radiogroup"
              aria-labelledby="tax-action-label"
              className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800"
            >
              {(['BUY', 'SELL'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={action === option}
                  onClick={() => setAction(option)}
                  className={cn(
                    'flex-1 py-1 font-semibold rounded text-center transition',
                    action === option
                      ? option === 'BUY'
                        ? 'bg-cyan-500 text-slate-950 shadow'
                        : 'bg-rose-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <NumberField
            id="tax-price"
            label="Option Premium (₹)"
            value={price}
            min={0.05}
            onChange={setPrice}
          />
          <NumberField id="tax-qty" label="Quantity (Units)" value={qty} min={1} onChange={setQty} />

          <div>
            <label htmlFor="tax-brokerage" className="text-[11px] text-slate-400 block mb-1">
              Brokerage Model
            </label>
            <select
              id="tax-brokerage"
              value={brokeragePerOrder}
              onChange={(e) => setBrokeragePerOrder(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value={20}>Standard Discount Broker (₹20/order)</option>
              <option value={0}>Zero Brokerage (₹0/order)</option>
            </select>
          </div>

          <div>
            <label htmlFor="tax-exchange" className="text-[11px] text-slate-400 block mb-1">
              Exchange
            </label>
            <select
              id="tax-exchange"
              value={isBse ? 'BSE' : 'NSE'}
              onChange={(e) => setIsBse(e.target.value === 'BSE')}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
            >
              <option value="NSE">NSE (0.05% premium)</option>
              <option value="BSE">BSE (0.0375% premium)</option>
            </select>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <h4 className="font-semibold text-xs text-white uppercase tracking-wider">
            Single Order ({action} side)
          </h4>

          <dl className="divide-y divide-slate-800/80 text-xs font-mono">
            <ChargeRow
              label="Securities Transaction Tax (STT)"
              note={`${(CHARGE_RATES.sttSellRate * 100).toFixed(4)}% on sell premium only`}
              value={oneWay.stt}
            />
            <ChargeRow
              label="Exchange Transaction Charge"
              note={`${isBse ? 'BSE 0.0375%' : 'NSE 0.05%'} of premium turnover`}
              value={oneWay.exchangeTurnover}
            />
            <ChargeRow
              label="SEBI Turnover Fee"
              note="₹10 per crore"
              value={oneWay.sebiCharges}
            />
            <ChargeRow
              label="GST"
              note={`${CHARGE_RATES.gstRate * 100}% on brokerage + exchange + SEBI`}
              value={oneWay.gst}
            />
            <ChargeRow
              label="Stamp Duty"
              note={`${(CHARGE_RATES.stampDutyBuyRate * 100).toFixed(3)}% on buy premium only`}
              value={oneWay.stampDuty}
            />
            <ChargeRow label="Brokerage" note="Flat per order" value={oneWay.brokerage} />
          </dl>

          <div className="flex justify-between items-center border-t border-slate-700 pt-3 text-sm font-bold">
            <span className="text-slate-200">Single-order cost</span>
            <span className="font-mono text-amber-400">₹{oneWay.totalCharges.toFixed(2)}</span>
          </div>
        </section>

        <section className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <Row label="Premium Turnover" value={formatINR(premiumTurnover)} />
            <Row
              label="Round-Trip Cost (buy + sell)"
              value={`₹${roundTrip.totalCharges.toFixed(2)}`}
              emphasis
            />
            <div className="border-t border-slate-800 pt-3">
              <p className="text-[11px] text-slate-400">Breakeven Move Required</p>
              <p className="text-2xl font-bold font-mono text-cyan-400">
                {bePoints > 0 ? `${bePoints.toFixed(2)} pts` : '—'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
                The premium must move this far, on this side, for the position to clear both the entry
                and the exit statutory costs.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-[11px] text-slate-400">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Round-Trip Breakdown
            </h4>
            <Row label="STT (once, on sell)" value={`₹${roundTrip.stt.toFixed(2)}`} small />
            <Row label="Stamp Duty (once, on buy)" value={`₹${roundTrip.stampDuty.toFixed(2)}`} small />
            <Row label="Exchange (both sides)" value={`₹${roundTrip.exchangeTurnover.toFixed(2)}`} small />
            <Row label="SEBI (both sides)" value={`₹${roundTrip.sebiCharges.toFixed(2)}`} small />
            <Row label="GST (both sides)" value={`₹${roundTrip.gst.toFixed(2)}`} small />
            <Row label="Brokerage (2 orders)" value={`₹${roundTrip.brokerage.toFixed(2)}`} small />
            <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
              Rates reflect the position after the October 2024 merger of SEBI&apos;s IPFT into the
              exchange transaction charge. Re-verify against the latest circular before trading.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ChargeRow({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div className="py-2.5 flex justify-between items-center gap-3">
      <div className="min-w-0">
        <dt className="text-white font-sans font-medium">{label}</dt>
        <dd className="text-[11px] text-slate-500 font-sans">{note}</dd>
      </div>
      <dd className="font-mono text-slate-200 shrink-0">
        {value === 0 ? '—' : `₹${value.toFixed(2)}`}
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis = false,
  small = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  small?: boolean;
}) {
  return (
    <div className={cn('flex justify-between gap-3', small ? 'font-mono text-[11px]' : 'text-xs')}>
      <span className="text-slate-400">{label}</span>
      <span className={cn('shrink-0', emphasis ? 'font-mono text-rose-400' : 'font-mono text-white')}>
        {value}
      </span>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] text-slate-400 block mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(Math.max(min, parsed));
        }}
        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
      />
    </div>
  );
}
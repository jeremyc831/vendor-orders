'use client';

import { useState, useMemo } from 'react';
import TravisSkuAutocomplete from './TravisSkuAutocomplete';
import { defaultTravisDealer, DEFAULT_TRAVIS_STOVES_FREIGHT } from '@/data/dealer';
import { generateTravisPO } from '@/lib/travis-po';
import type { TravisProduct } from '@/types/travis';
import type { TravisOrderLineItem, TravisOrderData, TravisPoSuffixMode } from '@/types/travis-order';
import type { DealerInfo } from '@/types/manufacturer';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface Props {
  onOrderSent: () => void;
}

export default function TravisOrderForm({ onOrderSent }: Props) {
  const [dealerInfo, setDealerInfo] = useState<DealerInfo>({ ...defaultTravisDealer, orderDate: new Date().toISOString().split('T')[0] });
  const [showDealerEdit, setShowDealerEdit] = useState(false);
  const [lineItems, setLineItems] = useState<TravisOrderLineItem[]>([]);
  const [suffixMode, setSuffixMode] = useState<TravisPoSuffixMode>('lastName');
  const [customSuffix, setCustomSuffix] = useState('');
  const [orderNotes, setOrderNotes] = useState('SHIP COMPLETE');
  const [shipMethod, setShipMethod] = useState('LTL');
  const [freight, setFreight] = useState<number>(DEFAULT_TRAVIS_STOVES_FREIGHT);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);
  const [sendError, setSendError] = useState<string>('');

  const suffix = useMemo(() => {
    if (suffixMode === 'stock') return 'Stock';
    if (suffixMode === 'custom') return customSuffix;
    return dealerInfo.lastName;
  }, [suffixMode, customSuffix, dealerInfo.lastName]);

  const poNumber = useMemo(() => {
    if (!suffix) return '';
    return generateTravisPO(dealerInfo.orderDate, suffix);
  }, [dealerInfo.orderDate, suffix]);

  const subtotal = useMemo(
    () => lineItems.reduce((sum, li) => sum + li.lineTotal, 0),
    [lineItems]
  );
  const total = subtotal + freight;

  const isComplete = lineItems.length > 0 && poNumber.length > 0 && dealerInfo.shippingAddress.trim().length > 0;

  const addLineItem = (product: TravisProduct, qty: number) => {
    setLineItems(prev => {
      const existingIdx = prev.findIndex(li => li.sku === product.sku);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        const newQty = existing.qty + qty;
        updated[existingIdx] = {
          ...existing,
          qty: newQty,
          lineTotal: newQty * existing.unitPrice,
        };
        return updated;
      }
      return [
        ...prev,
        {
          sku: product.sku,
          name: product.name,
          qty,
          unitPrice: product.price,
          lineTotal: product.price * qty,
        },
      ];
    });
  };

  const updateQty = (sku: string, qty: number) => {
    setLineItems(prev => prev
      .map(li => li.sku === sku
        ? { ...li, qty: Math.max(0, qty), lineTotal: Math.max(0, qty) * li.unitPrice }
        : li
      )
      .filter(li => li.qty > 0)
    );
  };

  const removeLineItem = (sku: string) => {
    setLineItems(prev => prev.filter(li => li.sku !== sku));
  };

  const submit = async () => {
    if (!isComplete) return;
    setSending(true);
    setSendResult(null);
    setSendError('');

    const payload: TravisOrderData = {
      flow: 'stoves',
      dealerInfo: { ...dealerInfo, poNumber },
      lineItems,
      orderNotes,
      shipMethod,
      subtotal,
      freight,
      total,
    };

    try {
      const res = await fetch('/api/travis/send-stoves-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSendResult('success');
      setTimeout(() => onOrderSent(), 1800);
    } catch (err) {
      setSendResult('error');
      setSendError(err instanceof Error ? err.message : 'Failed to send order');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Vendor badge */}
      <div className="flex justify-center">
        <div className="p-4 rounded-lg border-2 border-brand bg-brand/10 text-center inline-block">
          <div className="text-2xl font-bold text-white">Travis Industries</div>
          <div className="text-sm text-slate-400 mt-1">
            Dealer #{dealerInfo.dealerNumber} &middot; Stoves / Fireplaces
          </div>
        </div>
      </div>

      {/* Dealer info */}
      <section className="bg-card rounded-lg border border-card-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Dealer Information</h2>
          <button
            onClick={() => setShowDealerEdit(!showDealerEdit)}
            className="text-sm text-brand-light hover:text-white transition"
          >
            {showDealerEdit ? 'Collapse' : 'Edit Details'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Customer Last Name {suffixMode === 'lastName' && <span className="text-red-400">*</span>}
            </label>
            <input
              type="text"
              value={dealerInfo.lastName}
              onChange={e => setDealerInfo(prev => ({ ...prev, lastName: e.target.value }))}
              className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
              placeholder="Customer last name"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Order Date</label>
            <input
              type="date"
              value={dealerInfo.orderDate}
              onChange={e => setDealerInfo(prev => ({ ...prev, orderDate: e.target.value }))}
              className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">PO #</label>
            <div className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-slate-400 font-mono">
              {poNumber || '—'}
            </div>
          </div>
        </div>

        {/* PO suffix mode */}
        <div className="mt-4">
          <label className="block text-sm text-slate-400 mb-2">PO Suffix</label>
          <div className="flex flex-wrap gap-2 items-center">
            {(['lastName', 'stock', 'custom'] as const).map(m => (
              <label key={m} className={`px-3 py-1.5 rounded border cursor-pointer transition ${
                suffixMode === m
                  ? 'border-brand bg-brand/20 text-white'
                  : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
              }`}>
                <input
                  type="radio"
                  className="sr-only"
                  checked={suffixMode === m}
                  onChange={() => setSuffixMode(m)}
                />
                {m === 'lastName' ? 'Last Name' : m === 'stock' ? 'Stock' : 'Custom'}
              </label>
            ))}
            {suffixMode === 'custom' && (
              <input
                type="text"
                value={customSuffix}
                onChange={e => setCustomSuffix(e.target.value)}
                placeholder="Custom suffix"
                className="ml-2 bg-input-bg border border-input-border rounded px-3 py-1.5 text-white text-sm focus:border-brand focus:outline-none"
              />
            )}
          </div>
        </div>

        {showDealerEdit && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Dealer Name</label>
              <input type="text" value={dealerInfo.dealerName} onChange={e => setDealerInfo(prev => ({ ...prev, dealerName: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Dealer #</label>
              <input type="text" value={dealerInfo.dealerNumber} onChange={e => setDealerInfo(prev => ({ ...prev, dealerNumber: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ordered By</label>
              <input type="text" value={dealerInfo.orderedBy} onChange={e => setDealerInfo(prev => ({ ...prev, orderedBy: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input type="email" value={dealerInfo.email} onChange={e => setDealerInfo(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Shipping Address <span className="text-red-400">*</span></label>
              <input type="text" value={dealerInfo.shippingAddress} onChange={e => setDealerInfo(prev => ({ ...prev, shippingAddress: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ship Method</label>
              <input type="text" value={shipMethod} onChange={e => setShipMethod(e.target.value)} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Phone</label>
              <input type="text" value={dealerInfo.phone} onChange={e => setDealerInfo(prev => ({ ...prev, phone: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Payment Method</label>
              <input type="text" value={dealerInfo.paymentMethod} readOnly className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-slate-500 cursor-not-allowed" />
            </div>
          </div>
        )}

        {!showDealerEdit && (
          <div className="mt-3 text-sm text-slate-400">
            Ship to: {dealerInfo.shippingAddress} &middot; {shipMethod} &middot; {dealerInfo.paymentMethod}
          </div>
        )}
      </section>

      {/* SKU entry */}
      <section className="bg-card rounded-lg border border-card-border p-6">
        <TravisSkuAutocomplete onAdd={addLineItem} placeholder="Type SKU (e.g. 98500277)…" />
      </section>

      {/* Line items */}
      {lineItems.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Items ({lineItems.length})</h2>
          <div className="space-y-2">
            {lineItems.map(li => (
              <div key={li.sku} className="bg-card rounded-lg border border-card-border px-4 py-3 flex items-center gap-3">
                <span className="font-mono text-xs text-brand-light w-28 shrink-0">{li.sku}</span>
                <span className="flex-1 text-sm text-white truncate">{li.name}</span>
                <span className="font-mono text-sm text-slate-400">{formatCurrency(li.unitPrice)}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(li.sku, li.qty - 1)}
                    className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center text-lg font-bold"
                  >−</button>
                  <input
                    type="number"
                    value={li.qty}
                    onChange={e => updateQty(li.sku, parseInt(e.target.value) || 0)}
                    className="w-14 text-center bg-input-bg border border-input-border rounded px-1 py-1 text-white font-mono focus:border-brand focus:outline-none"
                    min={0}
                  />
                  <button
                    onClick={() => updateQty(li.sku, li.qty + 1)}
                    className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center text-lg font-bold"
                  >+</button>
                </div>
                <span className="font-mono text-sm text-white w-20 text-right">{formatCurrency(li.lineTotal)}</span>
                <button
                  onClick={() => removeLineItem(li.sku)}
                  className="w-7 h-7 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition flex items-center justify-center"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Order notes */}
      <section>
        <label className="block text-sm text-slate-400 mb-1">Order Notes</label>
        <textarea
          value={orderNotes}
          onChange={e => setOrderNotes(e.target.value)}
          rows={2}
          className="w-full bg-card border border-card-border rounded-lg px-4 py-3 text-white focus:border-brand focus:outline-none resize-y"
        />
      </section>

      {/* Summary */}
      {lineItems.length > 0 && (
        <section className="bg-card rounded-lg border border-card-border p-4 space-y-2">
          <div className="flex justify-between text-slate-300">
            <span>Subtotal ({lineItems.length} line{lineItems.length !== 1 ? 's' : ''})</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span>Freight</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">$</span>
              <input
                type="number"
                value={freight}
                onChange={e => setFreight(Number(e.target.value) || 0)}
                className="w-24 bg-input-bg border border-input-border rounded px-2 py-1 text-white text-right font-mono focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-between text-white text-lg font-bold pt-2 border-t border-card-border">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(total)}</span>
          </div>
        </section>
      )}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!isComplete || sending}
        className={`w-full font-semibold py-3 px-6 rounded-lg transition ${
          isComplete && !sending
            ? 'bg-brand hover:bg-brand-light text-white'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        {sending ? 'Sending Order…' : 'Submit Order'}
      </button>
      {!isComplete && (
        <p className="text-sm text-slate-500 text-center">
          {lineItems.length === 0 && 'Add at least one item. '}
          {!poNumber && 'PO suffix required (fill last name, pick Stock, or enter a custom suffix). '}
          {!dealerInfo.shippingAddress.trim() && 'Shipping address required.'}
        </p>
      )}
      {sendResult === 'success' && (
        <p className="text-sm text-green-400 text-center">Order sent to Travis. Confirmation CC&apos;d to info@ and jeremy@.</p>
      )}
      {sendResult === 'error' && (
        <p className="text-sm text-red-400 text-center">{sendError || 'Failed to send order. Please try again.'}</p>
      )}
    </div>
  );
}

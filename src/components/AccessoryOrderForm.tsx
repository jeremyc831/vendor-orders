'use client';

import { useState, useMemo } from 'react';
import { AccessoryVendor, AccessoryLineItem, AccessoryOrderData } from '@/types/accessories';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface AccessoryOrderFormProps {
  vendor: AccessoryVendor;
  onBack: () => void;
  onOrderSent: () => void;
}

export default function AccessoryOrderForm({ vendor, onBack, onOrderSent }: AccessoryOrderFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [freight, setFreight] = useState(0);
  const [poNumber, setPoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const lineItems: AccessoryLineItem[] = useMemo(() => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const product = vendor.products.find(p => p.id === productId)!;
        return {
          productId,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: qty,
          lineTotal: product.price * qty,
        };
      });
  }, [quantities, vendor.products]);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal + freight;
  const isComplete = lineItems.length > 0 && poNumber.trim();

  const setQuantity = (productId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [productId]: Math.max(0, qty) }));
  };

  const handleSubmit = async () => {
    if (!isComplete) return;
    setSending(true);
    setSendResult(null);

    const orderData: AccessoryOrderData = {
      vendorId: vendor.id,
      vendorName: vendor.name,
      orderEmail: vendor.orderEmail,
      dealerInfo: {
        dealerName: 'Hibernation Stoves & Spas',
        orderedBy: 'Jeremy Carlson',
        email: 'jeremy@hibernation.com',
        shippingAddress: '2122 Highway 49 Suite D, Angels Camp, CA (Appointment Required - 24 Hour Notice)',
        phone: '209-795-4339',
        poNumber,
        orderDate,
        paymentMethod: 'EFT/ACH/Bank Wire/Prepay',
      },
      lineItems,
      notes,
      subtotal,
      freight,
      total,
    };

    try {
      const res = await fetch('/api/send-accessories-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
      if (!res.ok) throw new Error('Failed to send order');
      setSendResult('success');
      setTimeout(() => onOrderSent(), 2000);
    } catch (err) {
      console.error(err);
      setSendResult('error');
    } finally {
      setSending(false);
    }
  };

  const visibleProducts = activeCategory
    ? vendor.products.filter(p => p.category === activeCategory)
    : vendor.products;

  return (
    <div className="space-y-6 pb-12">
      {/* Selected vendor badge */}
      <div className="flex justify-center">
        <div className="p-4 rounded-lg border-2 border-brand bg-brand/10 text-center inline-block">
          <div className="text-2xl font-bold text-white">{vendor.name}</div>
          {vendor.accountNumber && (
            <div className="text-sm text-slate-400 mt-1">Account #{vendor.accountNumber}</div>
          )}
        </div>
      </div>

      {/* PO and Date */}
      <div className="bg-card rounded-lg border border-card-border p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">PO # <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={poNumber}
              onChange={e => setPoNumber(e.target.value)}
              className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
              placeholder="Required"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Order Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
              className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
            activeCategory === null
              ? 'bg-brand text-white'
              : 'bg-card border border-card-border text-slate-400 hover:text-white'
          }`}
        >
          All
        </button>
        {vendor.categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              activeCategory === cat
                ? 'bg-brand text-white'
                : 'bg-card border border-card-border text-slate-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {visibleProducts.map(product => {
          const qty = quantities[product.id] || 0;
          const isSelected = qty > 0;
          return (
            <div
              key={product.id}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 transition ${
                isSelected
                  ? 'border-amber-400 bg-amber-400/10'
                  : 'border-card-border bg-card'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">{product.name}</div>
                <div className="text-xs text-slate-500">
                  {product.sku && <span>{product.sku} · </span>}
                  {product.unit && <span>{product.unit}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className={`font-mono text-sm ${isSelected ? 'text-amber-400' : 'text-brand-light'}`}>
                  {formatCurrency(product.price)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQuantity(product.id, qty - 1)}
                    className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center text-lg font-bold"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={qty || ''}
                    onChange={e => setQuantity(product.id, parseInt(e.target.value) || 0)}
                    className="w-14 text-center bg-input-bg border border-input-border rounded px-1 py-1 text-white font-mono focus:border-brand focus:outline-none"
                    min={0}
                    placeholder="0"
                  />
                  <button
                    onClick={() => setQuantity(product.id, qty + 1)}
                    className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm text-slate-400 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-card border border-card-border rounded-lg px-4 py-3 text-white focus:border-brand focus:outline-none resize-y"
          placeholder="Additional notes..."
        />
      </div>

      {/* Order Summary */}
      {lineItems.length > 0 && (
        <div className="bg-card rounded-lg border border-card-border p-4 space-y-2">
          <h3 className="font-semibold text-white mb-2">Order Summary</h3>
          {lineItems.map(item => (
            <div key={item.productId} className="flex justify-between text-sm text-slate-300">
              <span>{item.name} x{item.quantity}</span>
              <span className="font-mono">{formatCurrency(item.lineTotal)}</span>
            </div>
          ))}
          <div className="border-t border-card-border pt-2 mt-2">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal ({lineItems.length} items)</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300 mt-1">
              <span>Freight</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  value={freight}
                  onChange={e => setFreight(Number(e.target.value))}
                  className="w-20 bg-input-bg border border-input-border rounded px-2 py-1 text-white text-right font-mono focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-between text-white text-lg font-bold mt-2 pt-2 border-t border-card-border">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isComplete || sending}
        className={`w-full font-semibold py-3 px-6 rounded-lg transition ${
          isComplete
            ? 'bg-brand hover:bg-brand-light text-white'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        {sending ? 'Sending Order...' : 'Submit Order'}
      </button>
      {!isComplete && (
        <p className="text-sm text-slate-500 text-center">
          {!poNumber.trim() && 'PO# required. '}
          {lineItems.length === 0 && 'Add items to your order.'}
        </p>
      )}
      {sendResult === 'success' && (
        <p className="text-sm text-green-400 text-center">Order sent successfully!</p>
      )}
      {sendResult === 'error' && (
        <p className="text-sm text-red-400 text-center">Failed to send order. Please try again.</p>
      )}
    </div>
  );
}

'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { AccessoryVendor, AccessoryProduct, AccessoryLineItem, AccessoryOrderData } from '@/types/accessories';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const emptyForm = { name: '', sku: '', price: '', category: '', unit: '', caseSize: '' };

interface AccessoryOrderFormProps {
  vendor: AccessoryVendor;
  onBack: () => void;
  onOrderSent: () => void;
}

export default function AccessoryOrderForm({ vendor, onBack, onOrderSent }: AccessoryOrderFormProps) {
  const [products, setProducts] = useState<AccessoryProduct[]>(vendor.products);
  const [categories, setCategories] = useState<string[]>(vendor.categories);
  const [productsLoading, setProductsLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [freight, setFreight] = useState(0);
  const [poNumber, setPoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Product management state
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${vendor.id}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products);
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setProductsLoading(false);
    }
  }, [vendor.id]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const lineItems: AccessoryLineItem[] = useMemo(() => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const product = products.find(p => p.id === productId)!;
        if (!product) return null;
        return {
          productId,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: qty,
          lineTotal: product.price * qty,
        };
      })
      .filter(Boolean) as AccessoryLineItem[];
  }, [quantities, products]);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal + freight;
  const isComplete = lineItems.length > 0 && poNumber.trim();

  const setQuantity = (productId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [productId]: Math.max(0, qty) }));
  };

  // --- CRUD handlers ---

  const handleAddProduct = async () => {
    if (!addForm.name || !addForm.price || !addForm.category) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${vendor.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          sku: addForm.sku || undefined,
          price: parseFloat(addForm.price),
          category: addForm.category,
          unit: addForm.unit || undefined,
          caseSize: addForm.caseSize ? parseInt(addForm.caseSize) : undefined,
        }),
      });
      if (res.ok) {
        await loadProducts();
        setAddForm(emptyForm);
        setAdding(false);
      }
    } catch (err) {
      console.error('Failed to add product:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEditProduct = async () => {
    if (!editingId || !editForm.name || !editForm.price || !editForm.category) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          name: editForm.name,
          sku: editForm.sku || undefined,
          price: parseFloat(editForm.price),
          category: editForm.category,
          unit: editForm.unit || undefined,
          caseSize: editForm.caseSize ? parseInt(editForm.caseSize) : undefined,
        }),
      });
      if (res.ok) {
        await loadProducts();
        setEditingId(null);
        setEditForm(emptyForm);
      }
    } catch (err) {
      console.error('Failed to edit product:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (product: AccessoryProduct) => {
    if (!confirm(`Delete "${product.name}"?`)) return;
    try {
      const res = await fetch(`/api/products/${vendor.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id }),
      });
      if (res.ok) {
        setQuantities(prev => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
        await loadProducts();
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  const startEdit = (product: AccessoryProduct) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      sku: product.sku || '',
      price: String(product.price),
      category: product.category,
      unit: product.unit || '',
      caseSize: product.caseSize ? String(product.caseSize) : '',
    });
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
    ? products.filter(p => p.category === activeCategory)
    : products;

  // --- Reusable inline form row ---
  const renderFormRow = (
    form: typeof emptyForm,
    setForm: (f: typeof emptyForm) => void,
    onSave: () => void,
    onCancel: () => void,
  ) => (
    <div className="px-4 py-3 rounded-lg border-2 border-dashed border-brand/50 bg-brand/5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
            placeholder="Product name"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">SKU</label>
          <input
            type="text"
            value={form.sku}
            onChange={e => setForm({ ...form, sku: e.target.value })}
            className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
            placeholder="Optional"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Price <span className="text-red-400">*</span></label>
          <input
            type="number"
            step="0.01"
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
            className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Category <span className="text-red-400">*</span></label>
          <input
            type="text"
            list="category-options"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
            placeholder="Category"
          />
          <datalist id="category-options">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Unit</label>
          <input
            type="text"
            value={form.unit}
            onChange={e => setForm({ ...form, unit: e.target.value })}
            className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
            placeholder="each, case..."
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Case Size</label>
          <input
            type="number"
            value={form.caseSize}
            onChange={e => setForm({ ...form, caseSize: e.target.value })}
            className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
            placeholder="Units/case"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.name || !form.price || !form.category}
          className={`px-4 py-1.5 rounded text-sm font-medium transition ${
            form.name && form.price && form.category
              ? 'bg-brand text-white hover:bg-brand-light'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );

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

      {/* Category filter + manage toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 flex-wrap flex-1">
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
          {categories.map(cat => (
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
        <button
          onClick={() => { setManaging(!managing); setAdding(false); setEditingId(null); }}
          className={`px-3 py-1.5 rounded text-sm font-medium transition shrink-0 ${
            managing
              ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {managing ? 'Done' : 'Manage Products'}
        </button>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {productsLoading ? (
          <div className="text-center py-8 text-slate-500">Loading products...</div>
        ) : (
          <>
            {visibleProducts.map(product => {
              const qty = quantities[product.id] || 0;
              const isSelected = qty > 0;
              const isEditing = editingId === product.id;

              if (isEditing) {
                return (
                  <div key={product.id}>
                    {renderFormRow(
                      editForm,
                      setEditForm,
                      handleEditProduct,
                      () => { setEditingId(null); setEditForm(emptyForm); }
                    )}
                  </div>
                );
              }

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
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{product.name}</span>
                      {product.isCustom && managing && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/20 text-brand-light">Custom</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {product.sku && <span>{product.sku}</span>}
                      {product.caseSize && (
                        <span>{product.sku ? ' · ' : ''}{product.caseSize} per case</span>
                      )}
                      {!product.caseSize && product.unit && (
                        <span>{product.sku ? ' · ' : ''}{product.unit}</span>
                      )}
                    </div>
                    {isSelected && product.caseSize && (
                      <div className="text-xs text-amber-400 mt-0.5">
                        {qty} {qty === 1 ? 'case' : 'cases'} = {qty * product.caseSize} units
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {managing && product.isCustom && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(product)}
                          className="w-7 h-7 rounded text-slate-500 hover:text-brand-light hover:bg-slate-700 transition flex items-center justify-center"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product)}
                          className="w-7 h-7 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition flex items-center justify-center"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <span className={`font-mono text-sm ${isSelected ? 'text-amber-400' : 'text-brand-light'}`}>
                      {formatCurrency(product.price)}{product.caseSize ? '/case' : ''}
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

            {/* Add product row */}
            {adding && renderFormRow(
              addForm,
              setAddForm,
              handleAddProduct,
              () => { setAdding(false); setAddForm(emptyForm); }
            )}

            {/* Add product button */}
            {managing && !adding && (
              <button
                onClick={() => { setAdding(true); setAddForm({ ...emptyForm, category: activeCategory || '' }); }}
                className="w-full py-3 rounded-lg border-2 border-dashed border-slate-600 text-slate-500 hover:border-brand hover:text-brand-light transition text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Product
              </button>
            )}
          </>
        )}
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

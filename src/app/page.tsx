'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { Manufacturer, DealerInfo } from '@/types/manufacturer';
import { getSeriesForManufacturer, findSeries } from '@/data';
import { defaultMarquisDealer, defaultSundanceDealer, DEFAULT_MARQUIS_FREIGHT, DEFAULT_SUNDANCE_FREIGHT } from '@/data/dealer';
import { calculateLineItemTotal, calculateOrderTotal, isOptionAvailable, isStepAvailable, getDefaultOptions, getDefaultCoverId, generatePO, formatCurrency } from '@/lib/pricing';
import { OrderLineItem } from '@/types/order';
import { StoredOrder } from '@/types/order-history';
import OrderHistory from '@/components/OrderHistory';
import AccessoryOrderForm from '@/components/AccessoryOrderForm';
import { accessoryVendors, findAccessoryVendor } from '@/data/accessories';
import { AccessoryVendor } from '@/types/accessories';

export default function OrderPage() {
  const [manufacturer, setManufacturer] = useState<Manufacturer | null>(null);
  const [selectedAccessoryVendor, setSelectedAccessoryVendor] = useState<AccessoryVendor | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [shellColorId, setShellColorId] = useState<string | null>(null);
  const [cabinetColorId, setCabinetColorId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [stepColor, setStepColor] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [freight, setFreight] = useState<number>(0);
  const [dealerInfo, setDealerInfo] = useState<DealerInfo>(defaultMarquisDealer);
  const [showDealerEdit, setShowDealerEdit] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<{
    manufacturer: string;
    poNumber: string;
    orderDate: string;
    series: string;
    model: string;
    shellColor: string;
    cabinetColor: string;
    cover: string;
    steps: { name: string; price: number }[];
    stepColor: string | null;
    options: { name: string; price: number }[];
    notes: string;
    lineItemTotal: number;
    freight: number;
    discount: number;
    total: number;
  } | null>(null);
  const [noOptions, setNoOptions] = useState(false);
  const [noSteps, setNoSteps] = useState(false);
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const seriesList = manufacturer ? getSeriesForManufacturer(manufacturer) : [];
  const currentSeries = manufacturer && selectedSeriesId ? findSeries(manufacturer, selectedSeriesId) : null;
  const currentModel = currentSeries?.models.find(m => m.id === selectedModelId) ?? null;

  const handleManufacturerSelect = useCallback((m: Manufacturer) => {
    setManufacturer(m);
    setSelectedSeriesId(null);
    setSelectedModelId(null);
    setShellColorId(null);
    setCabinetColorId(null);
    setSelectedOptions([]);
    setCoverId(null);
    setSelectedSteps([]);
    setStepColor(null);
    setNoOptions(false);
    setNoSteps(false);
    setNotes('');
    setFreight(m === 'marquis' ? DEFAULT_MARQUIS_FREIGHT : DEFAULT_SUNDANCE_FREIGHT);
    setDealerInfo(m === 'marquis'
      ? { ...defaultMarquisDealer, orderDate: new Date().toISOString().split('T')[0] }
      : { ...defaultSundanceDealer, orderDate: new Date().toISOString().split('T')[0] }
    );
  }, []);

  const handleSeriesSelect = useCallback((sId: string, m: Manufacturer) => {
    setSelectedSeriesId(sId);
    setSelectedModelId(null);
    setShellColorId(null);
    setCabinetColorId(null);
    setSelectedSteps([]);
    setStepColor(null);
    setNoOptions(false);
    setNoSteps(false);
    // Set includedByDefault options and auto-select default cover
    const series = findSeries(m, sId);
    if (series) {
      setSelectedOptions(getDefaultOptions(series));
      setCoverId(getDefaultCoverId(series));
    }
  }, []);

  const handleModelSelect = useCallback((mId: string) => {
    setSelectedModelId(mId);
    // Keep default options but reset steps and selections
    if (currentSeries) {
      setSelectedOptions(getDefaultOptions(currentSeries));
    }
    setSelectedSteps([]);
    setStepColor(null);
    setNoOptions(false);
    setNoSteps(false);
  }, [currentSeries]);

  const toggleOption = useCallback((optId: string) => {
    setSelectedOptions(prev => {
      if (prev.includes(optId)) {
        return prev.filter(id => {
          if (id === optId) return false;
          if (!currentSeries) return true;
          const opt = currentSeries.options.find(o => o.id === id);
          return opt?.requires !== optId;
        });
      }
      return [...prev, optId];
    });
  }, [currentSeries]);

  const toggleStep = useCallback((sId: string) => {
    setSelectedSteps(prev =>
      prev.includes(sId) ? prev.filter(id => id !== sId) : [...prev, sId]
    );
  }, []);

  const lineItemTotal = useMemo(() => {
    if (!currentSeries || !selectedModelId || !shellColorId || !cabinetColorId || !coverId) return 0;
    const item: OrderLineItem = {
      manufacturer: manufacturer!,
      seriesId: selectedSeriesId!,
      seriesName: currentSeries.name,
      modelId: selectedModelId,
      modelName: currentModel?.name ?? '',
      shellColorId,
      shellColorName: '',
      cabinetColorId,
      cabinetColorName: '',
      selectedOptions,
      coverId,
      selectedSteps,
      notes,
      basePrice: currentModel?.dealerCost ?? 0,
      optionsTotal: 0,
      shellUpcharge: 0,
    };
    return calculateLineItemTotal(currentSeries, item);
  }, [currentSeries, selectedModelId, shellColorId, cabinetColorId, coverId, selectedSteps, selectedOptions, manufacturer, selectedSeriesId, currentModel, notes]);

  const orderTotals = useMemo(() => {
    if (!manufacturer) return { subtotal: 0, discount: 0, total: 0 };
    return calculateOrderTotal(lineItemTotal, freight, manufacturer);
  }, [lineItemTotal, freight, manufacturer]);

  const optionsConfirmed = noOptions || selectedOptions.some(id => !currentSeries?.options.find(o => o.id === id)?.includedByDefault);
  const stepsConfirmed = noSteps || selectedSteps.length > 0 || (currentSeries?.steps.length === 0);
  const poNumber = dealerInfo.lastName && dealerInfo.orderDate ? generatePO(dealerInfo.orderDate, dealerInfo.lastName) : '';
  const isOrderComplete = manufacturer && selectedSeriesId && selectedModelId && shellColorId && cabinetColorId && coverId && optionsConfirmed && stepsConfirmed && dealerInfo.lastName;

  const handleSendOrder = async () => {
    if (!isOrderComplete || !currentSeries || !currentModel) return;
    setSending(true);
    setSendResult(null);
    try {
      const shellColor = currentSeries.shellColors.find(c => c.id === shellColorId);
      const cabinetColor = currentSeries.cabinetColors.find(c => c.id === cabinetColorId);
      const cover = currentSeries.covers.find(c => c.id === coverId);
      const steps = selectedSteps.map(sId => currentSeries.steps.find(s => s.id === sId)).filter(Boolean);
      const opts = selectedOptions.map(id => currentSeries.options.find(o => o.id === id)).filter(Boolean);

      const orderData = {
        manufacturer,
        dealerInfo: { ...dealerInfo, poNumber },
        series: currentSeries.name,
        seriesId: currentSeries.id,
        model: currentModel.name,
        modelId: currentModel.id,
        dealerCost: currentModel.dealerCost,
        msrp: currentModel.msrp,
        shellColor: shellColor?.name ?? '',
        shellColorCode: shellColor?.code ?? '',
        shellUpcharge: shellColor?.upcharge ?? 0,
        cabinetColor: cabinetColor?.name ?? '',
        cabinetColorCode: cabinetColor?.code ?? '',
        cover: cover?.name ?? '',
        coverPrice: cover?.price ?? 0,
        steps: steps.map(s => ({ name: s!.name, price: s!.price })),
        stepColor: stepColor ?? null,
        options: opts.map(o => ({ name: o!.name, price: o!.price })),
        notes,
        freight,
        lineItemTotal,
        ...orderTotals,
      };

      const res = await fetch('/api/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to send order');
      }
      setSendResult('success');
      setSubmittedOrder({
        manufacturer: manufacturer === 'marquis' ? 'Marquis' : 'Sundance',
        poNumber,
        orderDate: dealerInfo.orderDate,
        series: currentSeries.name,
        model: currentModel.name,
        shellColor: shellColor?.name ?? '',
        cabinetColor: cabinetColor?.name ?? '',
        cover: cover?.name ?? '',
        steps: steps.map(s => ({ name: s!.name, price: s!.price })),
        stepColor: stepColor ?? null,
        options: opts.map(o => ({ name: o!.name, price: o!.price })),
        notes,
        lineItemTotal,
        freight,
        discount: orderTotals.discount,
        total: orderTotals.total,
      });
    } catch (err) {
      console.error(err);
      setSendResult('error');
    } finally {
      setSending(false);
    }
  };

  const resetOrder = useCallback(() => {
    setManufacturer(null);
    setSelectedAccessoryVendor(null);
    setSelectedSeriesId(null);
    setSelectedModelId(null);
    setShellColorId(null);
    setCabinetColorId(null);
    setSelectedOptions([]);
    setCoverId(null);
    setSelectedSteps([]);
    setStepColor(null);
    setNotes('');
    setSendResult(null);
    setSubmittedOrder(null);
    setNoOptions(false);
    setNoSteps(false);
    fetchOrders();
  }, [fetchOrders]);

  // Check which steps have color options among selected steps
  const stepsWithColors = currentSeries?.steps.filter(
    s => selectedSteps.includes(s.id) && s.colors && s.colors.length > 0
  ) ?? [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-card border-b border-card-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Image src="/hibernation-logo.png" alt="Hibernation" width={48} height={48} className="rounded" />
          <div>
            <h1 className="text-xl font-bold text-white">Spa Orders</h1>
            <p className="text-sm text-slate-400">Hibernation Stoves & Spas</p>
          </div>
        </div>
        {(manufacturer || submittedOrder) && (
          <button
            onClick={resetOrder}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            New Order
          </button>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Success Screen */}
        {submittedOrder && (
          <section className="space-y-6">
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white">Order Submitted</h2>
              <p className="text-slate-400 mt-1">Confirmation sent to info@hibernation.com</p>
            </div>

            <div className="bg-card rounded-lg border border-card-border p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-white">{submittedOrder.manufacturer} &middot; {submittedOrder.series}</h3>
                  <p className="text-slate-400 text-sm">PO #{submittedOrder.poNumber} &middot; {submittedOrder.orderDate}</p>
                </div>
                <span className="text-2xl font-bold text-white font-mono">{formatCurrency(submittedOrder.total)}</span>
              </div>

              <div className="border-t border-card-border pt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Model</span>
                  <p className="text-white">{submittedOrder.model}</p>
                </div>
                <div>
                  <span className="text-slate-500">Shell Color</span>
                  <p className="text-white">{submittedOrder.shellColor}</p>
                </div>
                <div>
                  <span className="text-slate-500">Cabinet Color</span>
                  <p className="text-white">{submittedOrder.cabinetColor}</p>
                </div>
                <div>
                  <span className="text-slate-500">Cover</span>
                  <p className="text-white">{submittedOrder.cover}</p>
                </div>
              </div>

              {submittedOrder.options.length > 0 && (
                <div className="border-t border-card-border pt-4">
                  <span className="text-slate-500 text-sm">Options</span>
                  <div className="mt-1 space-y-1">
                    {submittedOrder.options.map((o, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-white">{o.name}</span>
                        <span className="text-slate-400 font-mono">{formatCurrency(o.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submittedOrder.steps.length > 0 && (
                <div className="border-t border-card-border pt-4">
                  <span className="text-slate-500 text-sm">Steps</span>
                  <div className="mt-1 space-y-1">
                    {submittedOrder.steps.map((s, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-white">{s.name}{submittedOrder.stepColor ? ` (${submittedOrder.stepColor})` : ''}</span>
                        <span className="text-slate-400 font-mono">{s.price > 0 ? formatCurrency(s.price) : 'Included'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-card-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Spa Total</span>
                  <span className="text-white font-mono">{formatCurrency(submittedOrder.lineItemTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Freight</span>
                  <span className="text-white font-mono">{formatCurrency(submittedOrder.freight)}</span>
                </div>
                {submittedOrder.discount > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>2% EFT/Prepay Discount</span>
                    <span className="font-mono">-{formatCurrency(submittedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-card-border pt-2 text-lg font-bold">
                  <span className="text-white">Order Total</span>
                  <span className="text-white font-mono">{formatCurrency(submittedOrder.total)}</span>
                </div>
              </div>

              {submittedOrder.notes && (
                <div className="border-t border-card-border pt-4">
                  <span className="text-slate-500 text-sm">Notes</span>
                  <p className="text-white text-sm mt-1">{submittedOrder.notes}</p>
                </div>
              )}
            </div>

            <button
              onClick={resetOrder}
              className="w-full font-semibold py-3 px-6 rounded-lg bg-brand hover:bg-brand-light text-white transition"
            >
              Start New Order
            </button>
          </section>
        )}

        {!submittedOrder && (<>
        {/* Vendor Selection */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Spas</h3>
          <div className="grid grid-cols-2 gap-4">
            {(['marquis', 'sundance'] as Manufacturer[]).map(m => (
              <button
                key={m}
                onClick={() => handleManufacturerSelect(m)}
                className={`p-6 rounded-lg border-2 transition text-center ${
                  manufacturer === m
                    ? 'border-brand bg-brand/10 text-white'
                    : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                }`}
              >
                <Image
                  src={m === 'marquis' ? '/marquis-logo.png' : '/sundance-logo.png'}
                  alt={m === 'marquis' ? 'Marquis' : 'Sundance'}
                  width={200}
                  height={48}
                  className="h-12 w-auto mx-auto object-contain"
                />
                <div className="text-sm text-slate-400 mt-1">
                  Dealer #{m === 'marquis' ? '101099' : '1805'} &middot; Default freight: {formatCurrency(m === 'marquis' ? DEFAULT_MARQUIS_FREIGHT : DEFAULT_SUNDANCE_FREIGHT)}/spa
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Supplies Vendor Buttons */}
        {!manufacturer && !selectedAccessoryVendor && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Supplies &amp; Accessories</h3>
            <div className="grid grid-cols-2 gap-4">
              {accessoryVendors.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedAccessoryVendor(v)}
                  className="p-6 rounded-lg border-2 border-card-border bg-card text-slate-300 hover:border-slate-500 transition text-center"
                >
                  <div className="text-2xl font-bold">{v.name}</div>
                  <div className="text-sm text-slate-400 mt-1">
                    {v.products.length} products
                    {v.accountNumber && ` · Account #${v.accountNumber}`}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Accessories Order Form */}
        {selectedAccessoryVendor && (
          <AccessoryOrderForm
            vendor={selectedAccessoryVendor}
            onBack={resetOrder}
            onOrderSent={resetOrder}
          />
        )}

        {/* Order History - visible only on home screen */}
        {!manufacturer && !selectedAccessoryVendor && (
          <OrderHistory orders={orders} loading={ordersLoading} />
        )}

        {/* Dealer Info */}
        {manufacturer && (
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
                <label className="block text-sm text-slate-400 mb-1">Last Name <span className="text-red-400">*</span></label>
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
                  <label className="block text-sm text-slate-400 mb-1">Shipping Address</label>
                  <input type="text" value={dealerInfo.shippingAddress} onChange={e => setDealerInfo(prev => ({ ...prev, shippingAddress: e.target.value }))} className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none" />
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
                {dealerInfo.dealerName} &middot; #{dealerInfo.dealerNumber} &middot; {dealerInfo.orderedBy} &middot; {dealerInfo.paymentMethod}
              </div>
            )}
          </section>
        )}

        {/* Series Selection */}
        {manufacturer && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Select Series</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {seriesList.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSeriesSelect(s.id, manufacturer)}
                  className={`p-5 rounded-lg border-2 transition text-center ${
                    selectedSeriesId === s.id
                      ? 'border-brand bg-brand/10 text-white'
                      : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-lg font-bold">{s.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{s.models.length} models</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Two-column layout: Left (Model + Options) | Right (Colors + Cover + Steps) */}
        {currentSeries && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column: Model + Spa Options */}
            <div className="space-y-6">
              {/* Model Selection */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Select Model</h2>
                <div className="space-y-2">
                  {currentSeries.models.map(m => {
                    const selected = selectedModelId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleModelSelect(m.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                          selected
                            ? 'border-amber-400 bg-amber-400/10 text-white'
                            : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            {m.name}
                            {m.hasLounge && <span className="ml-2 text-xs text-slate-500">({m.hasLounge === 'double' ? 'Double Lounge' : 'Lounge'})</span>}
                            {m.voltage === 'both' && <span className="ml-2 text-xs text-amber-500">120V/240V</span>}
                          </span>
                          <span className={`font-mono text-sm ${selected ? 'text-amber-400' : 'text-brand-light'}`}>
                            {formatCurrency(m.dealerCost)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Spa Options */}
              {selectedModelId && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Spa Options</h2>
                  <div className="space-y-2">
                    {/* No Options button */}
                    <button
                      onClick={() => {
                        // Clear all non-includedByDefault options
                        setSelectedOptions(getDefaultOptions(currentSeries));
                        setNoOptions(true);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                        noOptions && selectedOptions.every(id => currentSeries.options.find(o => o.id === id)?.includedByDefault)
                          ? 'border-amber-400 bg-amber-400/10 text-white'
                          : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      No Additional Options
                    </button>
                    {currentSeries.options.map(opt => {
                      const available = isOptionAvailable(opt.id, selectedModelId, selectedOptions, currentSeries);
                      const checked = selectedOptions.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            if (!available) return;
                            toggleOption(opt.id);
                            setNoOptions(false);
                          }}
                          disabled={!available}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                            !available
                              ? 'opacity-40 cursor-not-allowed border-card-border bg-card text-slate-600'
                              : checked
                                ? 'border-amber-400 bg-amber-400/10 text-white'
                                : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span>
                              {opt.name}
                              {opt.note && <span className="ml-2 text-xs text-slate-500">({opt.note})</span>}
                            </span>
                            <span className={`font-mono text-sm ${checked ? 'text-amber-400' : 'text-brand-light'}`}>
                              {opt.includedByDefault ? 'Included' : formatCurrency(opt.price)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: Shell Color + Cabinet Color + Cover + Steps */}
            <div className="space-y-6">
              {/* Shell Color */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Shell Color</h2>
                <div className="space-y-2">
                  {currentSeries.shellColors.map(c => {
                    const selected = shellColorId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setShellColorId(c.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                          selected
                            ? 'border-amber-400 bg-amber-400/10 text-white'
                            : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span>
                            {c.name}
                            {c.note && <span className="ml-2 text-xs text-slate-500">({c.note})</span>}
                          </span>
                          {c.upcharge ? (
                            <span className={`text-sm font-mono ${selected ? 'text-amber-400' : 'text-brand-light'}`}>+{formatCurrency(c.upcharge)}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cabinet Color */}
              {selectedModelId && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Cabinet Color</h2>
                  <div className="space-y-2">
                    {currentSeries.cabinetColors.map(c => {
                      const selected = cabinetColorId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setCabinetColorId(c.id)}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                            selected
                              ? 'border-amber-400 bg-amber-400/10 text-white'
                              : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {c.name}
                          {c.code && <span className="ml-2 text-xs text-slate-500">({c.code})</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cover */}
              {selectedModelId && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Cover</h2>
                  <div className="space-y-2">
                    {currentSeries.covers.map(c => {
                      const selected = coverId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setCoverId(c.id)}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                            selected
                              ? 'border-amber-400 bg-amber-400/10 text-white'
                              : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span>{c.name}</span>
                            <span className={`text-sm font-mono ${selected ? 'text-amber-400' : 'text-brand-light'}`}>
                              {c.price > 0 ? `+${formatCurrency(c.price)}` : 'Included'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Steps (multi-select buttons) */}
              {selectedModelId && currentSeries.steps.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Steps &amp; Benches</h2>
                  <div className="space-y-2">
                    {/* No Steps button */}
                    <button
                      onClick={() => {
                        setSelectedSteps([]);
                        setStepColor(null);
                        setNoSteps(true);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                        noSteps && selectedSteps.length === 0
                          ? 'border-amber-400 bg-amber-400/10 text-white'
                          : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      No Steps
                    </button>
                    {currentSeries.steps.map(s => {
                      const avail = isStepAvailable(s.id, selectedModelId, currentSeries);
                      const checked = selectedSteps.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (!avail) return;
                            toggleStep(s.id);
                            setNoSteps(false);
                          }}
                          disabled={!avail}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                            !avail
                              ? 'opacity-40 cursor-not-allowed border-card-border bg-card text-slate-600'
                              : checked
                                ? 'border-amber-400 bg-amber-400/10 text-white'
                                : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span>{s.name}</span>
                            <span className={`font-mono text-sm ${checked ? 'text-amber-400' : 'text-brand-light'}`}>
                              {s.price > 0 ? formatCurrency(s.price) : 'Included'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Step color selector if any selected steps have colors */}
                  {stepsWithColors.length > 0 && (
                    <div className="mt-3">
                      <label className="block text-sm text-slate-400 mb-1">Step Color</label>
                      <select
                        value={stepColor ?? ''}
                        onChange={e => setStepColor(e.target.value)}
                        className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white focus:border-brand focus:outline-none"
                      >
                        <option value="">Select color...</option>
                        {stepsWithColors[0].colors!.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Notes */}
        {currentSeries && selectedModelId && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Notes</h2>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-card border border-card-border rounded-lg px-4 py-3 text-white focus:border-brand focus:outline-none resize-y"
              placeholder="Additional notes for this order..."
            />
          </section>
        )}

        {/* Order Summary */}
        {currentSeries && selectedModelId && shellColorId && cabinetColorId && coverId && (
          <section className="bg-card rounded-lg border border-card-border p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Order Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-slate-300">
                <span>{currentModel?.name} ({currentSeries.name})</span>
                <span className="font-mono">{formatCurrency(currentModel?.dealerCost ?? 0)}</span>
              </div>

              <div className="text-sm text-slate-400 pl-4">
                Shell: {currentSeries.shellColors.find(c => c.id === shellColorId)?.name}
                {' '}&middot;{' '}
                Cabinet: {currentSeries.cabinetColors.find(c => c.id === cabinetColorId)?.name}
              </div>

              {currentSeries.shellColors.find(c => c.id === shellColorId)?.upcharge ? (
                <div className="flex justify-between text-slate-400 text-sm">
                  <span className="pl-4">Shell color upcharge ({currentSeries.shellColors.find(c => c.id === shellColorId)?.name})</span>
                  <span className="font-mono">{formatCurrency(currentSeries.shellColors.find(c => c.id === shellColorId)?.upcharge ?? 0)}</span>
                </div>
              ) : null}

              {selectedOptions.map(optId => {
                const opt = currentSeries.options.find(o => o.id === optId);
                if (!opt) return null;
                return (
                  <div key={optId} className="flex justify-between text-slate-400 text-sm">
                    <span className="pl-4">{opt.name}</span>
                    <span className="font-mono">{opt.includedByDefault ? 'Included' : formatCurrency(opt.price)}</span>
                  </div>
                );
              })}

              {coverId && (currentSeries.covers.find(c => c.id === coverId)?.price ?? 0) > 0 && (
                <div className="flex justify-between text-slate-400 text-sm">
                  <span className="pl-4">{currentSeries.covers.find(c => c.id === coverId)?.name}</span>
                  <span className="font-mono">{formatCurrency(currentSeries.covers.find(c => c.id === coverId)?.price ?? 0)}</span>
                </div>
              )}

              {selectedSteps.map(sId => {
                const step = currentSeries.steps.find(s => s.id === sId);
                if (!step) return null;
                return (
                  <div key={sId} className="flex justify-between text-slate-400 text-sm">
                    <span className="pl-4">{step.name}{stepColor ? ` (${stepColor})` : ''}</span>
                    <span className="font-mono">{step.price > 0 ? formatCurrency(step.price) : 'Included'}</span>
                  </div>
                );
              })}

              <div className="border-t border-card-border pt-3">
                <div className="flex justify-between text-slate-300">
                  <span>Spa Total</span>
                  <span className="font-mono">{formatCurrency(lineItemTotal)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>Freight</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">$</span>
                  <input
                    type="number"
                    value={freight}
                    onChange={e => setFreight(Number(e.target.value))}
                    className="w-24 bg-input-bg border border-input-border rounded px-2 py-1 text-white text-right font-mono focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              {orderTotals.discount > 0 && (
                <div className="flex justify-between text-green-400 text-sm">
                  <span>2% EFT/Prepay Discount</span>
                  <span className="font-mono">-{formatCurrency(orderTotals.discount)}</span>
                </div>
              )}

              <div className="border-t border-card-border pt-3">
                <div className="flex justify-between text-white text-lg font-bold">
                  <span>Order Total</span>
                  <span className="font-mono">{formatCurrency(orderTotals.total)}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Actions - always shown when manufacturer selected, grayed until complete */}
        {manufacturer && (
          <section className="pb-8">
            <button
              onClick={handleSendOrder}
              disabled={!isOrderComplete || sending}
              className={`w-full font-semibold py-3 px-6 rounded-lg transition ${
                isOrderComplete
                  ? 'bg-brand hover:bg-brand-light text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {sending ? 'Submitting Order...' : 'Submit Order'}
            </button>
            {sendResult === 'error' && (
              <div className="text-sm text-red-400 text-center mt-3">
                Failed to send order. Please try again.
              </div>
            )}
            {!isOrderComplete && (
              <div className="text-sm text-slate-500 text-center mt-3">
                Complete all selections to generate order:
                {!dealerInfo.lastName && ' Last name required.'}
                {!selectedSeriesId && ' Select a series.'}
                {!selectedModelId && selectedSeriesId && ' Select a model.'}
                {!shellColorId && selectedModelId && ' Shell color.'}
                {!cabinetColorId && selectedModelId && ' Cabinet color.'}
                {!coverId && selectedModelId && ' Cover type.'}
                {!optionsConfirmed && selectedModelId && ' Spa options.'}
                {!stepsConfirmed && selectedModelId && ' Steps selection.'}
              </div>
            )}
          </section>
        )}
        </>)}
      </main>
    </div>
  );
}

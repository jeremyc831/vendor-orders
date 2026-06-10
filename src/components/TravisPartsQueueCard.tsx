'use client';

import { useEffect, useState } from 'react';
import type { TravisPartsQueue } from '@/types/travis';

interface Props {
  queue: TravisPartsQueue;
  onQueueChange: (queue: TravisPartsQueue) => void;
  onSubmitted: (orderId: string) => void;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function TravisPartsQueueCard({ queue, onQueueChange, onSubmitted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = queue.lineItems.reduce((sum, li) => sum + li.priceAtAdd * li.qty, 0);
  const itemCount = queue.lineItems.reduce((sum, li) => sum + li.qty, 0);

  // The PO suffix is persisted server-side (the Thursday cron reads it from KV),
  // but the input must NOT be bound directly to that server state. Doing so made
  // every keystroke await a PATCH round-trip while `setBusy` re-rendered the
  // field back to the stale value — wiping what you typed ("one char at a time").
  // Instead: type into local `suffixDraft` (instant), and debounce-persist.
  const persistedSuffix = queue.suffixOverride ?? '';
  const [suffixDraft, setSuffixDraft] = useState(persistedSuffix);

  // Reflect externally-driven changes (initial queue load, submit/clear) into the
  // draft. No-op while editing, since after a save the persisted value === draft.
  useEffect(() => {
    setSuffixDraft(persistedSuffix);
  }, [persistedSuffix]);

  // Persist the draft a short beat after the user stops typing.
  useEffect(() => {
    if (suffixDraft === persistedSuffix) return;
    const t = setTimeout(() => { void handleSuffixChange(suffixDraft); }, 500);
    return () => clearTimeout(t);
    // handleSuffixChange is a stable hoisted declaration; re-run only on edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suffixDraft, persistedSuffix]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/travis/parts-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const data: { queue: TravisPartsQueue } = await res.json();
      onQueueChange(data.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Queue update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleQtyChange(sku: string, qty: number) {
    if (qty < 0) return;
    await patch({ action: 'updateQty', sku, qty });
  }

  async function handleRemove(sku: string) {
    await patch({ action: 'remove', sku });
  }

  async function handleClear() {
    if (!confirm('Clear the entire Travis parts queue? This cannot be undone.')) return;
    await patch({ action: 'clear' });
  }

  async function handleSuffixChange(suffix: string) {
    await patch({ action: 'setSuffix', suffix });
  }

  async function handleSubmitNow() {
    if (queue.lineItems.length === 0) return;
    if (!confirm(`Submit ${itemCount} item${itemCount !== 1 ? 's' : ''} to Travis now? This overrides the Thursday schedule.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/travis/parts-submit-now', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      onSubmitted(payload.orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-card rounded-lg border border-card-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Pending Parts Order</h2>
          <p className="text-sm text-slate-400">
            Submits automatically Thursday 1pm PT · {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatCurrency(subtotal)} subtotal
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSubmitNow}
            disabled={submitting || busy || queue.lineItems.length === 0}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              !submitting && !busy && queue.lineItems.length > 0
                ? 'bg-brand text-white hover:bg-brand-light'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Submitting…' : 'Submit now'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={busy || submitting || queue.lineItems.length === 0}
            className="px-3 py-2 rounded text-sm text-slate-400 hover:text-white border border-card-border hover:border-slate-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm text-slate-400">
          PO suffix <span className="text-xs text-slate-500">(defaults to <span className="font-mono">Stock</span> at submit)</span>
        </label>
        <input
          type="text"
          value={suffixDraft}
          onChange={e => setSuffixDraft(e.target.value)}
          onBlur={() => { if (suffixDraft !== persistedSuffix) void handleSuffixChange(suffixDraft); }}
          placeholder="Stock"
          className="w-48 bg-input-bg border border-input-border rounded px-3 py-1.5 text-sm text-white font-mono focus:border-brand focus:outline-none"
        />
      </div>

      {queue.lineItems.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-6">
          Queue is empty. Add SKUs below — they accumulate until Thursday&apos;s submit.
        </p>
      ) : (
        <div className="border border-card-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">SKU</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Description</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400 w-28">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 w-24">Unit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 w-24">Line</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {queue.lineItems.map(li => (
                <tr key={li.sku} className="border-t border-card-border">
                  <td className="px-3 py-2 font-mono text-xs text-brand-light whitespace-nowrap">{li.sku}</td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-xs">{li.nameAtAdd}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQtyChange(li.sku, li.qty - 1)}
                        disabled={busy}
                        className="w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition text-sm"
                        aria-label="Decrease qty"
                      >
                        −
                      </button>
                      <span className="font-mono text-white w-8 text-center">{li.qty}</span>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(li.sku, li.qty + 1)}
                        disabled={busy}
                        className="w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition text-sm"
                        aria-label="Increase qty"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{formatCurrency(li.priceAtAdd)}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{formatCurrency(li.priceAtAdd * li.qty)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleRemove(li.sku)}
                      disabled={busy}
                      className="text-slate-500 hover:text-red-400 disabled:opacity-40 transition"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800/40">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-sm text-slate-400">Subtotal</td>
                <td className="px-3 py-2 text-right font-mono text-white">{formatCurrency(subtotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

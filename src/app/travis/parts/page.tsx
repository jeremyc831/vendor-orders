'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TravisSkuAutocomplete from '@/components/TravisSkuAutocomplete';
import TravisPartsQueueCard from '@/components/TravisPartsQueueCard';
import type { TravisPartsQueue, TravisProduct } from '@/types/travis';

export default function TravisPartsPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<TravisPartsQueue>({ lineItems: [], lastUpdated: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justSubmittedId, setJustSubmittedId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/travis/parts-queue');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { queue: TravisPartsQueue } = await res.json();
        setQueue(data.queue);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load queue');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(product: TravisProduct, qty: number) {
    setAddError(null);
    try {
      const res = await fetch('/api/travis/parts-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          sku: product.sku,
          name: product.name,
          price: product.price,
          qty,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const data: { queue: TravisPartsQueue } = await res.json();
      setQueue(data.queue);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Add failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-start justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-slate-400 hover:text-white transition mb-1"
            >
              ← Home
            </button>
            <h1 className="text-2xl font-bold text-white">Travis Parts</h1>
            <p className="text-sm text-slate-400">
              Items accumulate in the queue; Thursday 1pm PT the full order ships as one PO to Travis.
            </p>
          </div>
        </header>

        {justSubmittedId && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-green-300">
            <p className="font-medium">Order submitted.</p>
            <p className="text-sm text-green-400/80">Order ID {justSubmittedId} — confirmation email on the way.</p>
          </div>
        )}

        {loading ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
            Loading queue…
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
            {error}
          </div>
        ) : (
          <TravisPartsQueueCard
            queue={queue}
            onQueueChange={setQueue}
            onSubmitted={id => {
              setJustSubmittedId(id);
              setQueue({ lineItems: [], lastUpdated: new Date().toISOString() });
            }}
          />
        )}

        <div className="bg-card rounded-lg border border-card-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Add to queue</h3>
          <TravisSkuAutocomplete onAdd={handleAdd} placeholder="Enter Travis parts SKU…" />
          {addError && (
            <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">
              {addError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

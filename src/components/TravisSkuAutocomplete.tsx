'use client';

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import type { TravisProduct } from '@/types/travis';

interface Props {
  /** Called when the user confirms a product (either by Enter on match or saving the unknown-SKU form). */
  onAdd: (product: TravisProduct, qty: number) => void;
  /** Optional placeholder hint. */
  placeholder?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function TravisSkuAutocomplete({
  onAdd,
  placeholder = 'Enter SKU…',
}: Props) {
  const [catalog, setCatalog] = useState<TravisProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Unknown-SKU form state
  const [unknownMode, setUnknownMode] = useState(false);
  const [unknownName, setUnknownName] = useState('');
  const [unknownPrice, setUnknownPrice] = useState('');
  const [unknownSaving, setUnknownSaving] = useState(false);
  const [unknownError, setUnknownError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/travis/catalog');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { products: TravisProduct[] } = await res.json();
        if (!cancelled) {
          setCatalog(data.products);
          setCatalogLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setCatalogError(err instanceof Error ? err.message : 'Failed to load catalog');
          setCatalogLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const matches = useCallback((): TravisProduct[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const sku: TravisProduct[] = [];
    const name: TravisProduct[] = [];
    for (const p of catalog) {
      if (p.sku.toLowerCase().startsWith(q)) sku.push(p);
      else if (p.name.toLowerCase().includes(q)) name.push(p);
      if (sku.length >= 20) break;
    }
    return [...sku, ...name].slice(0, 20);
  }, [query, catalog])();

  const exactMatch = matches.find(p => p.sku.toLowerCase() === query.trim().toLowerCase());
  const noMatches = query.trim().length > 0 && matches.length === 0 && !catalogLoading;

  const commit = (product: TravisProduct) => {
    onAdd(product, 1);
    setQuery('');
    setHighlightedIdx(0);
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setDropdownOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) {
        commit(matches[highlightedIdx] ?? matches[0]);
      } else if (exactMatch) {
        commit(exactMatch);
      } else if (noMatches) {
        setUnknownMode(true);
        setUnknownName('');
        setUnknownPrice('');
        setUnknownError(null);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const saveUnknown = async () => {
    const sku = query.trim();
    const name = unknownName.trim();
    const price = parseFloat(unknownPrice);
    if (!sku || !name || !isFinite(price) || price < 0) {
      setUnknownError('SKU, name, and a valid price are required');
      return;
    }
    setUnknownSaving(true);
    setUnknownError(null);
    try {
      const res = await fetch('/api/travis/add-manual-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, name, price }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { product }: { product: TravisProduct } = await res.json();
      // Merge into local catalog so autocomplete finds it on next keystroke.
      setCatalog(prev => {
        const filtered = prev.filter(p => p.sku.toUpperCase() !== product.sku.toUpperCase());
        return [...filtered, product];
      });
      commit(product);
      setUnknownMode(false);
    } catch (err) {
      setUnknownError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setUnknownSaving(false);
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm text-slate-400 mb-1">
        Add by SKU
        {catalogLoading && <span className="ml-2 text-xs text-slate-500">(loading catalog…)</span>}
        {catalogError && <span className="ml-2 text-xs text-red-400">{catalogError}</span>}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setDropdownOpen(true); setHighlightedIdx(0); }}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={catalogLoading}
        className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-white font-mono focus:border-brand focus:outline-none disabled:opacity-50"
      />

      {dropdownOpen && matches.length > 0 && !unknownMode && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-card-border rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {matches.map((p, i) => (
            <button
              key={p.sku}
              onMouseDown={e => e.preventDefault() /* keep focus */}
              onClick={() => commit(p)}
              className={`w-full text-left px-3 py-2 flex items-start gap-3 transition ${
                i === highlightedIdx ? 'bg-brand/20 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="font-mono text-xs text-brand-light shrink-0 w-28">{p.sku}</span>
              <span className="flex-1 min-w-0 text-sm truncate">{p.name}</span>
              <span className="font-mono text-sm text-slate-400 shrink-0">{formatCurrency(p.price)}</span>
            </button>
          ))}
        </div>
      )}

      {noMatches && !unknownMode && (
        <div className="mt-2 text-sm">
          <span className="text-slate-400">No match for <span className="font-mono">{query}</span>. </span>
          <button
            type="button"
            onClick={() => { setUnknownMode(true); setUnknownName(''); setUnknownPrice(''); setUnknownError(null); }}
            className="text-brand-light hover:text-white underline transition"
          >
            Add as new part
          </button>
        </div>
      )}

      {unknownMode && (
        <div className="mt-3 p-3 rounded-lg border-2 border-dashed border-brand/50 bg-brand/5 space-y-3">
          <div className="text-sm">
            <span className="text-slate-400">Adding new SKU: </span>
            <span className="font-mono text-white">{query.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Description <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={unknownName}
                onChange={e => setUnknownName(e.target.value)}
                className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
                placeholder="What is it?"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Unit Price <span className="text-red-400">*</span></label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={unknownPrice}
                onChange={e => setUnknownPrice(e.target.value)}
                className="w-full bg-input-bg border border-input-border rounded px-2 py-1.5 text-sm text-white focus:border-brand focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>
          {unknownError && <div className="text-xs text-red-400">{unknownError}</div>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setUnknownMode(false)}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveUnknown}
              disabled={unknownSaving || !unknownName.trim() || !unknownPrice.trim()}
              className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                !unknownSaving && unknownName.trim() && unknownPrice.trim()
                  ? 'bg-brand text-white hover:bg-brand-light'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {unknownSaving ? 'Saving…' : 'Add & insert'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

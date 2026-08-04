'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Sop } from '@/types/playbook';
import { CATEGORY_LABELS, CATEGORY_STYLES, VALID_CATEGORIES, formatDate, isStale } from '@/lib/playbook';

export default function PlaybookListPage() {
  const router = useRouter();
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [owner, setOwner] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/playbook/sops');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { sops: Sop[] } = await res.json();
        setSops(data.sops);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load playbook');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const owners = useMemo(
    () => Array.from(new Set(sops.map(s => s.owner).filter(Boolean))).sort(),
    [sops]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sops
      .filter(s => (showArchived ? true : s.status !== 'archived'))
      .filter(s => (category ? s.category === category : true))
      .filter(s => (owner ? s.owner === owner : true))
      .filter(s => {
        if (!q) return true;
        const haystack = [s.title, s.purpose, s.trigger, ...s.steps.map(st => st.text)].join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [sops, query, category, owner, showArchived]);

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-slate-400 hover:text-white transition mb-1"
            >
              ← Home
            </button>
            <h1 className="text-2xl font-bold text-white">Playbook</h1>
            <p className="text-sm text-slate-400">One-page SOPs, fed by the mistake log.</p>
          </div>
          <Link
            href="/playbook/new"
            className="shrink-0 bg-brand hover:bg-brand-light text-white font-semibold py-2.5 px-4 rounded-lg transition"
          >
            + New SOP
          </Link>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/playbook/mistakes"
            className="bg-amber-500/10 border-2 border-amber-500/40 hover:border-amber-400 rounded-lg p-4 text-center transition"
          >
            <div className="text-lg font-bold text-amber-300">Log a Mistake</div>
            <div className="text-xs text-amber-200/70 mt-0.5">30 seconds, phone-friendly</div>
          </Link>
          <Link
            href="/playbook/mistakes"
            className="bg-card border-2 border-card-border hover:border-slate-500 rounded-lg p-4 text-center transition"
          >
            <div className="text-lg font-bold text-slate-200">Mistake Log</div>
            <div className="text-xs text-slate-400 mt-0.5">Open · converted · dismissed</div>
          </Link>
        </div>

        <div className="space-y-3">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search SOPs…"
            className="w-full bg-input-bg border border-input-border rounded-lg px-4 py-3 text-base text-white placeholder-slate-500 focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`py-2 px-4 rounded-lg border-2 text-sm font-medium transition ${
                category === null
                  ? 'border-brand bg-brand/15 text-white'
                  : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
              }`}
            >
              All
            </button>
            {VALID_CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className={`py-2 px-4 rounded-lg border-2 text-sm font-medium transition ${
                  category === c
                    ? 'border-brand bg-brand/15 text-white'
                    : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
            {owners.length > 1 && (
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="py-2 px-3 rounded-lg border-2 border-card-border bg-card text-sm text-slate-300 focus:border-brand focus:outline-none"
              >
                <option value="">Any owner</option>
                {owners.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setShowArchived(v => !v)}
              className={`py-2 px-3 rounded-lg border-2 text-sm transition ${
                showArchived
                  ? 'border-slate-500 bg-slate-700/40 text-slate-200'
                  : 'border-card-border bg-card text-slate-500 hover:border-slate-500'
              }`}
            >
              {showArchived ? 'Hiding nothing' : 'Show archived'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
            Loading playbook…
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
            {sops.length === 0 ? 'No SOPs yet.' : 'Nothing matches that filter.'}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(sop => (
              <li key={sop.id}>
                <Link
                  href={`/playbook/${sop.slug}`}
                  className="block bg-card border-2 border-card-border hover:border-brand rounded-lg p-4 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-lg font-semibold text-white leading-snug">{sop.title}</div>
                    <div className="flex gap-1.5 shrink-0">
                      {sop.status === 'draft' && (
                        <span className="text-xs py-0.5 px-2 rounded border bg-slate-600/20 border-slate-500/40 text-slate-300">
                          Draft
                        </span>
                      )}
                      {sop.status === 'archived' && (
                        <span className="text-xs py-0.5 px-2 rounded border bg-slate-700/30 border-slate-600/40 text-slate-400">
                          Archived
                        </span>
                      )}
                      {isStale(sop) && (
                        <span className="text-xs py-0.5 px-2 rounded border bg-amber-500/10 border-amber-500/40 text-amber-300">
                          Stale
                        </span>
                      )}
                    </div>
                  </div>
                  {sop.purpose && <p className="text-sm text-slate-400 mt-1">{sop.purpose}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    <span className={`py-0.5 px-2 rounded border ${CATEGORY_STYLES[sop.category]}`}>
                      {CATEGORY_LABELS[sop.category]}
                    </span>
                    {sop.owner && <span>Owner: {sop.owner}</span>}
                    <span>v{sop.version}</span>
                    <span>Reviewed {formatDate(sop.lastReviewedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

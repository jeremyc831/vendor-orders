'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Sop } from '@/types/playbook';
import { useStoredName } from '@/lib/useStoredName';

interface RevisionMeta {
  version: number;
  changedBy: string;
  changeNote: string;
  createdAt: string;
}

export default function SopHistoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [sop, setSop] = useState<Sop | null>(null);
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [yourName] = useStoredName();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playbook/sops/${slug}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'SOP not found' : `HTTP ${res.status}`);
      const data: { sop: Sop; revisions: RevisionMeta[] } = await res.json();
      setSop(data.sop);
      setRevisions(data.revisions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(version: number) {
    if (!sop) return;
    if (!window.confirm(`Restore v${version}? The current v${sop.version} stays in history.`)) return;
    setRestoring(version);
    try {
      const res = await fetch(`/api/playbook/sops/${sop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', version, changedBy: yourName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push(`/playbook/${sop.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setRestoring(null);
    }
  }

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <Link href={`/playbook/${slug}`} className="text-sm text-slate-400 hover:text-white transition">
            ← Back to SOP
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">{sop ? `History: ${sop.title}` : 'History'}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Every save is kept. Restoring an old version creates a new one — nothing is ever lost.
          </p>
        </header>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">{error}</div>}

        {!sop && !error ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">Loading…</div>
        ) : sop ? (
          <ul className="space-y-2">
            {revisions.map(rev => (
              <li
                key={rev.version}
                className="bg-card border border-card-border rounded-lg p-4 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[12rem]">
                  <div className="text-white font-semibold">
                    v{rev.version}
                    {rev.version === sop.version && (
                      <span className="ml-2 text-xs py-0.5 px-2 rounded border bg-green-500/10 border-green-500/30 text-green-300">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-400 mt-0.5">
                    {rev.changeNote || 'No note'} — {rev.changedBy}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(rev.createdAt).toLocaleString()}</div>
                </div>
                {rev.version !== sop.version && (
                  <button
                    type="button"
                    onClick={() => handleRestore(rev.version)}
                    disabled={restoring !== null}
                    className="py-2 px-4 rounded-lg border-2 border-card-border bg-card text-sm text-slate-300 hover:border-brand disabled:opacity-50 transition"
                  >
                    {restoring === rev.version ? 'Restoring…' : `Restore v${rev.version}`}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

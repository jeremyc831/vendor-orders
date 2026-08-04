'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Mistake, Sop } from '@/types/playbook';
import {
  CATEGORY_LABELS,
  CATEGORY_STYLES,
  directImageUrl,
  formatDate,
  isStale,
  videoEmbedUrl,
} from '@/lib/playbook';
import { formatCurrency } from '@/lib/pricing';

interface SopResponse {
  sop: Sop;
  mistakes: Mistake[];
}

export default function SopPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<SopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playbook/sops/${slug}`);
      if (res.status === 404) throw new Error('SOP not found');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SOP');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkReviewed() {
    if (!data) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/playbook/sops/${data.sop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-reviewed' }),
      });
      if (res.ok) {
        const { sop } = await res.json();
        setData(d => (d ? { ...d, sop } : d));
      }
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background py-6 px-4">
        <div className="max-w-3xl mx-auto bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
          Loading SOP…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background py-6 px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Link href="/playbook" className="text-sm text-slate-400 hover:text-white transition">
            ← Playbook
          </Link>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
            {error ?? 'SOP not found'}
          </div>
        </div>
      </div>
    );
  }

  const { sop, mistakes } = data;
  const embed = videoEmbedUrl(sop.videoUrl);
  const stale = isStale(sop);

  const secondaryBtn =
    'py-2 px-3 rounded-lg border-2 border-card-border bg-card text-sm text-slate-300 hover:border-slate-500 transition';

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <Link href="/playbook" className="text-sm text-slate-400 hover:text-white transition">
            ← Playbook
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <h1 className="text-2xl font-bold text-white">{sop.title}</h1>
            {sop.status !== 'active' && (
              <span className="text-xs py-0.5 px-2 rounded border bg-slate-600/20 border-slate-500/40 text-slate-300 capitalize">
                {sop.status}
              </span>
            )}
            {stale && (
              <span className="text-xs py-0.5 px-2 rounded border bg-amber-500/10 border-amber-500/40 text-amber-300">
                Stale
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
            <span className={`py-0.5 px-2 rounded border ${CATEGORY_STYLES[sop.category]}`}>
              {CATEGORY_LABELS[sop.category]}
            </span>
            {sop.owner && <span>Owner: {sop.owner}</span>}
            <span>v{sop.version}</span>
            <span>
              Reviewed {formatDate(sop.lastReviewedAt)}
              {stale ? ' — over 90 days ago' : ''}
            </span>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/playbook/${sop.slug}/edit`}
            className="bg-brand hover:bg-brand-light text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Edit
          </Link>
          <button type="button" onClick={handleMarkReviewed} disabled={marking} className={secondaryBtn}>
            {marking ? 'Marking…' : 'Mark reviewed'}
          </button>
          <Link href={`/playbook/${sop.slug}/print`} className={secondaryBtn}>
            Print
          </Link>
          <Link href={`/playbook/${sop.slug}/card`} className={secondaryBtn}>
            QR card
          </Link>
          <Link href={`/playbook/${sop.slug}/history`} className={secondaryBtn}>
            History
          </Link>
          <Link href={`/playbook/new?from=${sop.slug}`} className={secondaryBtn}>
            Duplicate
          </Link>
        </div>

        {(sop.trigger || sop.purpose) && (
          <section className="bg-card rounded-lg border border-card-border p-5 space-y-3">
            {sop.trigger && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">When to use</div>
                <p className="text-slate-200 mt-0.5">{sop.trigger}</p>
              </div>
            )}
            {sop.purpose && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</div>
                <p className="text-slate-200 mt-0.5">{sop.purpose}</p>
              </div>
            )}
          </section>
        )}

        {sop.videoUrl && (
          <section className="bg-card rounded-lg border border-card-border p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Watch — the video is the SOP</h2>
            {embed ? (
              <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={embed}
                  loading="lazy"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                  title={`Video: ${sop.title}`}
                />
              </div>
            ) : (
              <a
                href={sop.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-light hover:text-white transition break-all"
              >
                {sop.videoUrl}
              </a>
            )}
          </section>
        )}

        {sop.steps.length > 0 && (
          <section className="bg-card rounded-lg border border-card-border p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Steps</h2>
            <ol className="space-y-3">
              {sop.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <div className="shrink-0 w-6 h-6 mt-0.5 rounded border-2 border-slate-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-base text-slate-200 leading-snug">
                      {step.text}
                      {!step.required && <span className="text-slate-500 text-sm"> (optional)</span>}
                    </p>
                    {step.photoPrompt && (
                      <p className="text-sm text-brand-light mt-0.5">📷 {step.photoPrompt}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {sop.photoUrls.length > 0 && (
          <section className="bg-card rounded-lg border border-card-border p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Photos</h2>
            <div className="grid grid-cols-2 gap-3">
              {sop.photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* External user-pasted URLs (Dropbox etc.) — next/image needs domain allowlisting, so plain img */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={directImageUrl(url)}
                    alt={`Photo ${i + 1} for ${sop.title}`}
                    loading="lazy"
                    className="w-full h-40 object-cover rounded-lg border border-card-border"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {sop.bodyMd && (
          <section className="bg-card rounded-lg border border-card-border p-5">
            <h2 className="text-sm font-semibold text-white mb-2">Notes</h2>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{sop.bodyMd}</p>
          </section>
        )}

        <section className="bg-card rounded-lg border border-card-border p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Common mistakes</h2>
          <p className="text-xs text-slate-500 mb-3">Auto-populated from the mistake log — this keeps the document alive.</p>
          {mistakes.length === 0 ? (
            <p className="text-sm text-slate-400">
              None linked yet.{' '}
              <Link href="/playbook/mistakes" className="text-brand-light hover:text-white transition">
                Attach one from the Mistake Log →
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {mistakes.map(m => (
                <li key={m.id} className="border border-card-border rounded-lg p-3">
                  <p className="text-sm text-slate-200">{m.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                    <span>{formatDate(m.happenedOn)}</span>
                    {m.jobRef && <span>Job {m.jobRef}</span>}
                    {m.estCost !== null && <span className="text-amber-300/80">~{formatCurrency(m.estCost)}</span>}
                    {m.reportedBy && m.reportedBy !== 'Seed' && <span>by {m.reportedBy}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

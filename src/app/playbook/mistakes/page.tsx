'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Mistake, Sop } from '@/types/playbook';
import { formatDate, parseCost, todayYMD } from '@/lib/playbook';
import { formatCurrency } from '@/lib/pricing';
import { useStoredName } from '@/lib/useStoredName';

type Filter = 'open' | 'converted' | 'dismissed' | 'all';

export default function MistakeLogPage() {
  const router = useRouter();
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick-add form
  const [description, setDescription] = useState('');
  const [happenedOn, setHappenedOn] = useState(todayYMD());
  const [jobRef, setJobRef] = useState('');
  const [cost, setCost] = useState('');
  const [yourName, setYourName] = useStoredName();
  const [submitting, setSubmitting] = useState(false);
  const [justLogged, setJustLogged] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const [filter, setFilter] = useState<Filter>('open');
  // Inline attach panel state, one open at a time
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachSopId, setAttachSopId] = useState('');
  const [attachAsStep, setAttachAsStep] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([fetch('/api/playbook/mistakes'), fetch('/api/playbook/sops')]);
        if (!mRes.ok || !sRes.ok) throw new Error(`HTTP ${mRes.ok ? sRes.status : mRes.status}`);
        const mData: { mistakes: Mistake[] } = await mRes.json();
        const sData: { sops: Sop[] } = await sRes.json();
        setMistakes(mData.mistakes);
        setSops(sData.sops);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load mistake log');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sopById = useMemo(() => new Map(sops.map(s => [s.id, s])), [sops]);
  const attachableSops = useMemo(() => sops.filter(s => s.status !== 'archived'), [sops]);

  const filtered = useMemo(
    () => (filter === 'all' ? mistakes : mistakes.filter(m => m.status === filter)),
    [mistakes, filter]
  );

  const counts = useMemo(
    () => ({
      open: mistakes.filter(m => m.status === 'open').length,
      converted: mistakes.filter(m => m.status === 'converted').length,
      dismissed: mistakes.filter(m => m.status === 'dismissed').length,
    }),
    [mistakes]
  );

  async function handleQuickAdd() {
    const desc = description.trim();
    if (!desc) {
      descriptionRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/playbook/mistakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: desc,
          happenedOn,
          jobRef,
          estCost: parseCost(cost),
          reportedBy: yourName,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { mistake } = (await res.json()) as { mistake: Mistake };
      setMistakes(list => [mistake, ...list]);
      setDescription('');
      setJobRef('');
      setCost('');
      setFilter('open');
      setJustLogged(true);
      setTimeout(() => setJustLogged(false), 2500);
      descriptionRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log mistake');
    } finally {
      setSubmitting(false);
    }
  }

  async function patchMistake(id: string, payload: Record<string, unknown>) {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/playbook/mistakes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { mistake } = (await res.json()) as { mistake: Mistake };
      setMistakes(list => list.map(m => (m.id === id ? mistake : m)));
      setAttachingId(null);
      setAttachSopId('');
      setAttachAsStep(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  const input =
    'bg-input-bg border border-input-border rounded px-3 py-2.5 text-base text-white placeholder-slate-500 focus:border-brand focus:outline-none';
  const chip = (active: boolean) =>
    `py-2 px-4 rounded-lg border-2 text-sm font-medium transition ${
      active ? 'border-brand bg-brand/15 text-white' : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
    }`;
  const actionBtn =
    'py-2 px-3 rounded-lg border-2 border-card-border bg-card text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50 transition';

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <button
            type="button"
            onClick={() => router.push('/playbook')}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Playbook
          </button>
          <h1 className="text-2xl font-bold text-white mt-1">Mistake Log</h1>
          <p className="text-sm text-slate-400">
            Every field error becomes a checklist line within a day or two. Log it while it stings.
          </p>
        </header>

        {/* Quick add — under 30 seconds on a phone */}
        <section className="bg-card rounded-lg border-2 border-amber-500/30 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-300">What happened?</h2>
          <textarea
            ref={descriptionRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Left without after-photos — client disputing the gate repair"
            className={`${input} w-full`}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              type="date"
              value={happenedOn}
              onChange={e => setHappenedOn(e.target.value)}
              className={input}
              aria-label="Date it happened"
            />
            <input
              type="text"
              value={jobRef}
              onChange={e => setJobRef(e.target.value)}
              placeholder="Job # (Jobber)"
              className={input}
            />
            <input
              type="text"
              inputMode="decimal"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="Rough cost $"
              className={input}
            />
            <input
              type="text"
              value={yourName}
              onChange={e => setYourName(e.target.value)}
              placeholder="Your name"
              className={input}
            />
          </div>
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={submitting}
            className="w-full bg-amber-500/90 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-3 px-4 rounded-lg transition"
          >
            {submitting ? 'Logging…' : 'Log it'}
          </button>
          {justLogged && (
            <p className="text-sm text-green-400 text-center">Logged. Convert it to an SOP when you have a minute.</p>
          )}
        </section>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">{error}</div>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFilter('open')} className={chip(filter === 'open')}>
            Open ({counts.open})
          </button>
          <button type="button" onClick={() => setFilter('converted')} className={chip(filter === 'converted')}>
            Converted ({counts.converted})
          </button>
          <button type="button" onClick={() => setFilter('dismissed')} className={chip(filter === 'dismissed')}>
            Dismissed ({counts.dismissed})
          </button>
          <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>
            All
          </button>
        </div>

        {loading ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
            {filter === 'open' ? 'Nothing open — the playbook is winning.' : 'Nothing here.'}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(m => {
              const linkedSop = m.sopId ? sopById.get(m.sopId) : null;
              return (
                <li key={m.id} className="bg-card border border-card-border rounded-lg p-4 space-y-3">
                  <div>
                    <p className="text-base text-slate-200">{m.description}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                      <span>{formatDate(m.happenedOn)}</span>
                      {m.jobRef && <span>Job {m.jobRef}</span>}
                      {m.estCost !== null && <span className="text-amber-300/80">~{formatCurrency(m.estCost)}</span>}
                      {m.reportedBy && m.reportedBy !== 'Unknown' && m.reportedBy !== 'Seed' && (
                        <span>by {m.reportedBy}</span>
                      )}
                      {m.status === 'dismissed' && <span className="text-slate-400">Dismissed</span>}
                    </div>
                    {linkedSop && (
                      <Link
                        href={`/playbook/${linkedSop.slug}`}
                        className="inline-block mt-1.5 text-sm text-brand-light hover:text-white transition"
                      >
                        → {linkedSop.title}
                      </Link>
                    )}
                  </div>

                  {m.status === 'open' && (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/playbook/new?mistake=${m.id}`}
                        className="py-2 px-3 rounded-lg bg-brand hover:bg-brand-light text-sm text-white font-medium transition"
                      >
                        Convert to new SOP
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachingId(attachingId === m.id ? null : m.id);
                          setAttachSopId('');
                          setAttachAsStep(false);
                        }}
                        className={actionBtn}
                      >
                        Attach to existing…
                      </button>
                      <button
                        type="button"
                        onClick={() => patchMistake(m.id, { action: 'dismiss' })}
                        disabled={actionBusy}
                        className="py-2 px-3 rounded-lg border-2 border-card-border bg-card text-sm text-slate-500 hover:border-slate-500 disabled:opacity-50 transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {m.status !== 'open' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => patchMistake(m.id, { action: 'reopen' })}
                        disabled={actionBusy}
                        className={actionBtn}
                      >
                        Reopen
                      </button>
                    </div>
                  )}

                  {attachingId === m.id && (
                    <div className="border border-card-border rounded-lg p-3 space-y-2.5">
                      <select
                        value={attachSopId}
                        onChange={e => setAttachSopId(e.target.value)}
                        className={`${input} w-full`}
                      >
                        <option value="">Choose an SOP…</option>
                        {attachableSops.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                            {s.status === 'draft' ? ' (draft)' : ''}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={attachAsStep}
                          onChange={e => setAttachAsStep(e.target.checked)}
                          className="w-5 h-5 accent-amber-500"
                        />
                        Also add it as a step on that SOP
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          patchMistake(m.id, {
                            action: 'attach',
                            sopId: attachSopId,
                            addAsStep: attachAsStep,
                            changedBy: yourName,
                          })
                        }
                        disabled={!attachSopId || actionBusy}
                        className="w-full bg-brand hover:bg-brand-light disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-lg transition"
                      >
                        {actionBusy ? 'Attaching…' : 'Attach'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

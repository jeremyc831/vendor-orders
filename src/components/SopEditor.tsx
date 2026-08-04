'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Sop, SopInput } from '@/types/playbook';
import { CATEGORY_LABELS, VALID_CATEGORIES, VALID_STATUSES, videoEmbedUrl } from '@/lib/playbook';
import { useStoredName } from '@/lib/useStoredName';

/** Step row with a stable client-side key so reordering doesn't remount inputs. */
interface EditableStep {
  key: string;
  text: string;
  required: boolean;
  /** undefined = photo-prompt input hidden; '' = shown but empty */
  photoPrompt?: string;
}

interface SopEditorProps {
  /** Existing SOP when editing; null when creating. */
  existing: Sop | null;
  /** Prefilled fields for the create flow (convert-from-mistake / duplicate). */
  prefill?: Partial<SopInput>;
  /** When creating from a mistake, links it on save. */
  fromMistakeId?: string;
}

let stepKeyCounter = 0;
const nextKey = () => `step-${++stepKeyCounter}`;

export default function SopEditor({ existing, prefill, fromMistakeId }: SopEditorProps) {
  const router = useRouter();
  const base: SopInput = {
    title: existing?.title ?? prefill?.title ?? '',
    purpose: existing?.purpose ?? prefill?.purpose ?? '',
    trigger: existing?.trigger ?? prefill?.trigger ?? '',
    category: existing?.category ?? prefill?.category ?? 'field',
    owner: existing?.owner ?? prefill?.owner ?? '',
    steps: existing?.steps ?? prefill?.steps ?? [],
    videoUrl: existing?.videoUrl ?? prefill?.videoUrl ?? null,
    photoUrls: existing?.photoUrls ?? prefill?.photoUrls ?? [],
    bodyMd: existing?.bodyMd ?? prefill?.bodyMd ?? '',
    status: existing?.status ?? prefill?.status ?? 'draft',
  };

  const [title, setTitle] = useState(base.title);
  const [purpose, setPurpose] = useState(base.purpose);
  const [trigger, setTrigger] = useState(base.trigger);
  const [category, setCategory] = useState<SopInput['category']>(base.category);
  const [owner, setOwner] = useState(base.owner);
  const [status, setStatus] = useState<SopInput['status']>(base.status);
  const [videoUrl, setVideoUrl] = useState(base.videoUrl ?? '');
  const [photoText, setPhotoText] = useState(base.photoUrls.join('\n'));
  const [bodyMd, setBodyMd] = useState(base.bodyMd);
  const [steps, setSteps] = useState<EditableStep[]>(
    base.steps.map(s => ({ key: nextKey(), text: s.text, required: s.required, photoPrompt: s.photoPrompt }))
  );
  const [changeNote, setChangeNote] = useState('');
  const [yourName, setYourName] = useStoredName();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const embedCheck = videoEmbedUrl(videoUrl);

  function updateStep(key: string, patch: Partial<EditableStep>) {
    setSteps(list => list.map(s => (s.key === key ? { ...s, ...patch } : s)));
  }

  function moveStep(key: string, dir: -1 | 1) {
    setSteps(list => {
      const i = list.findIndex(s => s.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removeStep(key: string) {
    setSteps(list => list.filter(s => s.key !== key));
  }

  function addStep() {
    setSteps(list => [...list, { key: nextKey(), text: '', required: true }]);
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required — verb-first, e.g. "Close out a job".');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: trimmedTitle,
      purpose,
      trigger,
      category,
      owner,
      steps: steps
        .filter(s => s.text.trim())
        .map(s => ({
          text: s.text,
          required: s.required,
          ...(s.photoPrompt?.trim() ? { photoPrompt: s.photoPrompt } : {}),
        })),
      videoUrl: videoUrl.trim() || null,
      photoUrls: photoText
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean),
      bodyMd,
      status,
      changedBy: yourName,
      changeNote,
      ...(fromMistakeId ? { fromMistakeId } : {}),
    };

    try {
      const res = await fetch(existing ? `/api/playbook/sops/${existing.id}` : '/api/playbook/sops', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { sop } = (await res.json()) as { sop: Sop };
      router.push(`/playbook/${sop.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  const label = 'block text-sm text-slate-400 mb-1';
  const input =
    'w-full bg-input-bg border border-input-border rounded px-3 py-2.5 text-base text-white placeholder-slate-500 focus:border-brand focus:outline-none';
  const chip = (active: boolean) =>
    `py-2 px-4 rounded-lg border-2 text-sm font-medium transition ${
      active ? 'border-brand bg-brand/15 text-white' : 'border-card-border bg-card text-slate-300 hover:border-slate-500'
    }`;

  return (
    <div className="space-y-5">
      <section className="bg-card rounded-lg border border-card-border p-5 space-y-4">
        <div>
          <label className={label}>Title — verb-first</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='e.g. "Close out a job"'
            className={input}
            autoFocus={!existing}
          />
          {existing && <p className="text-xs text-slate-500 mt-1">URL stays /playbook/{existing.slug} — printed QR cards keep working.</p>}
        </div>
        <div>
          <label className={label}>When to use — the trigger moment, one line</label>
          <input type="text" value={trigger} onChange={e => setTrigger(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Why it matters — in money or callbacks if possible</label>
          <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} className={input} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Owner — one name</label>
            <input type="text" value={owner} onChange={e => setOwner(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Category</label>
            <div className="flex flex-wrap gap-2">
              {VALID_CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)} className={chip(category === c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className={label}>Status</label>
          <div className="flex flex-wrap gap-2">
            {VALID_STATUSES.map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={`${chip(status === s)} capitalize`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-card rounded-lg border border-card-border p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Steps</h2>
          <span className="text-xs text-slate-500">Max ~10 — if it needs more, it&apos;s two SOPs.</span>
        </div>
        {steps.length === 0 && <p className="text-sm text-slate-500 mb-3">No steps yet.</p>}
        <ul className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.key} className="border border-card-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-5 text-right shrink-0">{i + 1}.</span>
                <input
                  type="text"
                  value={step.text}
                  onChange={e => updateStep(step.key, { text: e.target.value })}
                  placeholder="What to do…"
                  className={input}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-7">
                <button
                  type="button"
                  onClick={() => updateStep(step.key, { required: !step.required })}
                  className={`py-1.5 px-3 rounded border text-xs font-medium transition ${
                    step.required
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-card border-card-border text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {step.required ? 'Required' : 'Optional'}
                </button>
                {step.photoPrompt === undefined ? (
                  <button
                    type="button"
                    onClick={() => updateStep(step.key, { photoPrompt: '' })}
                    className="py-1.5 px-3 rounded border border-card-border text-xs text-slate-400 hover:border-slate-500 transition"
                  >
                    + Photo prompt
                  </button>
                ) : null}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => moveStep(step.key, -1)}
                  disabled={i === 0}
                  aria-label="Move step up"
                  className="py-1.5 px-3 rounded border border-card-border text-sm text-slate-300 hover:border-slate-500 disabled:opacity-30 transition"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(step.key, 1)}
                  disabled={i === steps.length - 1}
                  aria-label="Move step down"
                  className="py-1.5 px-3 rounded border border-card-border text-sm text-slate-300 hover:border-slate-500 disabled:opacity-30 transition"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(step.key)}
                  aria-label="Remove step"
                  className="py-1.5 px-3 rounded border border-red-500/30 text-sm text-red-400 hover:border-red-400 transition"
                >
                  ✕
                </button>
              </div>
              {step.photoPrompt !== undefined && (
                <div className="pl-7 flex items-center gap-2">
                  <span className="text-sm shrink-0">📷</span>
                  <input
                    type="text"
                    value={step.photoPrompt}
                    onChange={e => updateStep(step.key, { photoPrompt: e.target.value })}
                    placeholder="Photo prompt, e.g. “Wide before/after of every work area”"
                    className={`${input} text-sm py-2`}
                  />
                  <button
                    type="button"
                    onClick={() => updateStep(step.key, { photoPrompt: undefined })}
                    aria-label="Remove photo prompt"
                    className="text-xs text-slate-500 hover:text-slate-300 transition shrink-0"
                  >
                    remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addStep}
          className="mt-3 w-full py-2.5 rounded-lg border-2 border-dashed border-card-border text-sm text-slate-300 hover:border-slate-500 transition"
        >
          + Add step
        </button>
      </section>

      <section className="bg-card rounded-lg border border-card-border p-5 space-y-4">
        <div>
          <label className={label}>Watch — Loom or unlisted YouTube link (60–120s phone video)</label>
          <input
            type="url"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://www.loom.com/share/…"
            className={input}
          />
          {videoUrl.trim() &&
            (embedCheck ? (
              <p className="text-xs text-green-400 mt-1">✓ Link recognized — will embed on the SOP page.</p>
            ) : (
              <p className="text-xs text-amber-300 mt-1">Link saved, but not embeddable — it will show as a plain link.</p>
            ))}
        </div>
        <div>
          <label className={label}>Photo URLs — one per line (Dropbox links work)</label>
          <textarea
            value={photoText}
            onChange={e => setPhotoText(e.target.value)}
            rows={2}
            className={`${input} font-mono text-sm`}
          />
        </div>
        <div>
          <label className={label}>Notes — optional, shown below the steps</label>
          <textarea value={bodyMd} onChange={e => setBodyMd(e.target.value)} rows={3} className={input} />
        </div>
      </section>

      <section className="bg-card rounded-lg border border-card-border p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Your name</label>
            <input
              type="text"
              value={yourName}
              onChange={e => setYourName(e.target.value)}
              placeholder="Who's saving this?"
              className={input}
            />
          </div>
          {existing && (
            <div>
              <label className={label}>Change note</label>
              <input
                type="text"
                value={changeNote}
                onChange={e => setChangeNote(e.target.value)}
                placeholder="What changed?"
                className={input}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand hover:bg-brand-light disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            {saving ? 'Saving…' : existing ? `Save as v${existing.version + 1}` : 'Create SOP'}
          </button>
          <Link
            href={existing ? `/playbook/${existing.slug}` : '/playbook'}
            className="py-3 px-4 text-sm text-slate-400 hover:text-white transition"
          >
            Cancel
          </Link>
        </div>
        {existing && (
          <p className="text-xs text-slate-500">
            Every save keeps the old version in{' '}
            <Link href={`/playbook/${existing.slug}/history`} className="text-brand-light hover:text-white transition">
              History
            </Link>
            {' '}— edit freely.
          </p>
        )}
      </section>
    </div>
  );
}

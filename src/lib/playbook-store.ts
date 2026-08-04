/**
 * KV-backed store for the Playbook module (SOPs, revisions, mistake log).
 *
 * Follows the `hasKV()` + in-memory fallback pattern from `src/lib/kv.ts` and
 * `src/lib/travis-queue.ts` so local dev without KV creds works end-to-end.
 *
 * Keys (all namespaced `playbook:` — no existing keys are touched):
 *   playbook:sop-ids            string[]              index of SOP ids
 *   playbook:sop:{id}           Sop
 *   playbook:sop-revisions:{id} SopRevision[]         append-only, capped
 *   playbook:mistakes           Mistake[]             newest first
 *   playbook:seeded             1                     NX-guarded seed flag
 *
 * There is no SQL database in this app, so "migration" for this module means
 * the idempotent `ensureSeeded()` below: first request after deploy claims the
 * NX flag and writes the template + example SOP + starter mistakes.
 */
import type { Mistake, MistakeStatus, Sop, SopInput, SopRevision } from '@/types/playbook';
import { slugify, uniqueSlug } from '@/lib/playbook';
import { buildSeedData } from '@/lib/playbook-seed';

const IDS_KEY = 'playbook:sop-ids';
const SEEDED_KEY = 'playbook:seeded';
const MISTAKES_KEY = 'playbook:mistakes';
const sopKey = (id: string) => `playbook:sop:${id}`;
const revisionsKey = (id: string) => `playbook:sop-revisions:${id}`;

/** Snapshots are full SOP copies; cap history per SOP so KV values stay small. */
const MAX_REVISIONS = 50;

// In-memory fallback for local dev without KV credentials.
const memStore = new Map<string, unknown>();

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

async function kvGet<T>(key: string): Promise<T | null> {
  if (hasKV()) {
    const kv = await getKV();
    return (await kv.get<T>(key)) ?? null;
  }
  return (memStore.get(key) as T | undefined) ?? null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasKV()) {
    const kv = await getKV();
    await kv.set(key, value);
  } else {
    memStore.set(key, value);
  }
}

/** SET NX — returns true if this call claimed the key. */
async function kvSetNx(key: string, value: unknown): Promise<boolean> {
  if (hasKV()) {
    const kv = await getKV();
    const res = await kv.set(key, value, { nx: true });
    return res !== null;
  }
  if (memStore.has(key)) return false;
  memStore.set(key, value);
  return true;
}

async function kvMGet<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  if (hasKV()) {
    const kv = await getKV();
    return (await kv.mget<(T | null)[]>(...keys)) ?? keys.map(() => null);
  }
  return keys.map(k => (memStore.get(k) as T | undefined) ?? null);
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Idempotent seed. Claims the NX flag first so concurrent first-requests can't
 * double-seed (the losing request may briefly see an empty list — harmless).
 */
export async function ensureSeeded(): Promise<void> {
  const claimed = await kvSetNx(SEEDED_KEY, 1);
  if (!claimed) return;

  const { sops, revisions, mistakes } = buildSeedData(new Date());
  for (const sop of sops) {
    await kvSet(sopKey(sop.id), sop);
  }
  for (const rev of revisions) {
    await kvSet(revisionsKey(rev.sopId), [rev]);
  }
  await kvSet(IDS_KEY, sops.map(s => s.id));
  await kvSet(MISTAKES_KEY, mistakes);
}

// ---------------------------------------------------------------------------
// SOPs
// ---------------------------------------------------------------------------

export async function listSops(): Promise<Sop[]> {
  const ids = (await kvGet<string[]>(IDS_KEY)) ?? [];
  const sops = (await kvMGet<Sop>(ids.map(sopKey))).filter((s): s is Sop => !!s);
  return sops.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Look up by id first, then by slug (QR URLs and pages address SOPs by slug). */
export async function getSop(idOrSlug: string): Promise<Sop | null> {
  const direct = await kvGet<Sop>(sopKey(idOrSlug));
  if (direct) return direct;
  const all = await listSops();
  return all.find(s => s.slug === idOrSlug) ?? null;
}

export async function listRevisions(sopId: string): Promise<SopRevision[]> {
  return (await kvGet<SopRevision[]>(revisionsKey(sopId))) ?? [];
}

async function appendRevision(sop: Sop, changedBy: string, changeNote: string): Promise<void> {
  const revision: SopRevision = {
    id: crypto.randomUUID(),
    sopId: sop.id,
    version: sop.version,
    snapshot: sop,
    changedBy: changedBy.trim() || 'Unknown',
    changeNote: changeNote.trim(),
    createdAt: new Date().toISOString(),
  };
  const existing = await listRevisions(sop.id);
  const next = [...existing, revision].slice(-MAX_REVISIONS);
  await kvSet(revisionsKey(sop.id), next);
}

export interface CreateSopOptions {
  changedBy: string;
  changeNote?: string;
  /** When set, the source mistake is linked to the new SOP and marked converted. */
  fromMistakeId?: string;
}

export async function createSop(input: SopInput, opts: CreateSopOptions): Promise<Sop> {
  const now = new Date().toISOString();
  const existing = await listSops();
  const slug = uniqueSlug(slugify(input.title), new Set(existing.map(s => s.slug)));

  const sop: Sop = {
    ...normalizeInput(input),
    id: crypto.randomUUID(),
    slug,
    version: 1,
    lastReviewedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await kvSet(sopKey(sop.id), sop);
  const ids = (await kvGet<string[]>(IDS_KEY)) ?? [];
  await kvSet(IDS_KEY, [...ids, sop.id]);
  await appendRevision(sop, opts.changedBy, opts.changeNote?.trim() || 'Created');

  if (opts.fromMistakeId) {
    await patchMistake(opts.fromMistakeId, { status: 'converted', sopId: sop.id });
  }
  return sop;
}

export interface UpdateSopOptions {
  changedBy: string;
  changeNote: string;
}

/**
 * Save an edit: bump version, write a revision, refresh lastReviewedAt
 * (editing a document counts as reviewing it). Slug never changes — it is
 * printed on QR cards.
 */
export async function updateSop(id: string, input: SopInput, opts: UpdateSopOptions): Promise<Sop | null> {
  const current = await kvGet<Sop>(sopKey(id));
  if (!current) return null;
  const now = new Date().toISOString();

  const updated: Sop = {
    ...current,
    ...normalizeInput(input),
    version: current.version + 1,
    lastReviewedAt: now,
    updatedAt: now,
  };
  await kvSet(sopKey(id), updated);
  await appendRevision(updated, opts.changedBy, opts.changeNote);
  return updated;
}

/** Reviewed-as-is: bumps the review date only — no version, no revision. */
export async function markReviewed(id: string): Promise<Sop | null> {
  const current = await kvGet<Sop>(sopKey(id));
  if (!current) return null;
  const updated: Sop = { ...current, lastReviewedAt: new Date().toISOString() };
  await kvSet(sopKey(id), updated);
  return updated;
}

/** Restore an old snapshot as a NEW version (history stays intact). */
export async function restoreRevision(id: string, version: number, changedBy: string): Promise<Sop | null> {
  const revisions = await listRevisions(id);
  const target = revisions.find(r => r.version === version);
  if (!target) return null;
  const { snapshot } = target;
  return updateSop(
    id,
    {
      title: snapshot.title,
      purpose: snapshot.purpose,
      trigger: snapshot.trigger,
      category: snapshot.category,
      owner: snapshot.owner,
      steps: snapshot.steps,
      videoUrl: snapshot.videoUrl,
      photoUrls: snapshot.photoUrls,
      bodyMd: snapshot.bodyMd,
      status: snapshot.status,
    },
    { changedBy, changeNote: `Restored v${version}` }
  );
}

function normalizeInput(input: SopInput): SopInput {
  return {
    title: input.title.trim(),
    purpose: input.purpose.trim(),
    trigger: input.trigger.trim(),
    category: input.category,
    owner: input.owner.trim(),
    steps: input.steps
      .map(s => ({
        text: s.text.trim(),
        required: !!s.required,
        ...(s.photoPrompt?.trim() ? { photoPrompt: s.photoPrompt.trim() } : {}),
      }))
      .filter(s => s.text.length > 0),
    videoUrl: input.videoUrl?.trim() || null,
    photoUrls: (input.photoUrls ?? []).map(u => u.trim()).filter(Boolean),
    bodyMd: input.bodyMd ?? '',
    status: input.status,
  };
}

// ---------------------------------------------------------------------------
// Mistakes
// ---------------------------------------------------------------------------

export async function listMistakes(): Promise<Mistake[]> {
  return (await kvGet<Mistake[]>(MISTAKES_KEY)) ?? [];
}

export async function getMistake(id: string): Promise<Mistake | null> {
  return (await listMistakes()).find(m => m.id === id) ?? null;
}

export interface AddMistakeInput {
  happenedOn: string;
  description: string;
  jobRef?: string;
  estCost?: number | null;
  reportedBy?: string;
}

export async function addMistake(input: AddMistakeInput): Promise<Mistake> {
  const mistake: Mistake = {
    id: crypto.randomUUID(),
    happenedOn: input.happenedOn,
    description: input.description.trim(),
    jobRef: input.jobRef?.trim() ?? '',
    estCost: input.estCost ?? null,
    reportedBy: input.reportedBy?.trim() || 'Unknown',
    status: 'open',
    sopId: null,
    createdAt: new Date().toISOString(),
  };
  const all = await listMistakes();
  await kvSet(MISTAKES_KEY, [mistake, ...all]);
  return mistake;
}

async function patchMistake(
  id: string,
  patch: Partial<Pick<Mistake, 'status' | 'sopId'>>
): Promise<Mistake | null> {
  const all = await listMistakes();
  const target = all.find(m => m.id === id);
  if (!target) return null;
  const updated = { ...target, ...patch };
  await kvSet(MISTAKES_KEY, all.map(m => (m.id === id ? updated : m)));
  return updated;
}

export async function setMistakeStatus(id: string, status: MistakeStatus): Promise<Mistake | null> {
  // Reopening a converted/attached mistake also unlinks it from its SOP.
  return patchMistake(id, status === 'open' ? { status, sopId: null } : { status });
}

export interface AttachMistakeOptions {
  /** Also append the mistake description as a (non-required) step on the SOP. */
  addAsStep?: boolean;
  changedBy?: string;
}

/**
 * Link a mistake to an existing SOP so it shows under that SOP's Common
 * Mistakes. Optionally also add it as a checklist step — that is a content
 * change, so it goes through updateSop (version bump + revision).
 */
export async function attachMistake(
  id: string,
  sopId: string,
  opts: AttachMistakeOptions = {}
): Promise<Mistake | null> {
  const sop = await kvGet<Sop>(sopKey(sopId));
  if (!sop) return null;
  const mistake = await patchMistake(id, { status: 'converted', sopId });
  if (!mistake) return null;

  if (opts.addAsStep && mistake.description) {
    await updateSop(
      sopId,
      {
        title: sop.title,
        purpose: sop.purpose,
        trigger: sop.trigger,
        category: sop.category,
        owner: sop.owner,
        steps: [...sop.steps, { text: mistake.description, required: false }],
        videoUrl: sop.videoUrl,
        photoUrls: sop.photoUrls,
        bodyMd: sop.bodyMd,
        status: sop.status,
      },
      {
        changedBy: opts.changedBy || 'Unknown',
        changeNote: `Added step from mistake log (${mistake.happenedOn})`,
      }
    );
  }
  return mistake;
}

/** Mistakes linked to an SOP, newest happened-on first — the Common Mistakes section. */
export async function mistakesForSop(sopId: string): Promise<Mistake[]> {
  const all = await listMistakes();
  return all
    .filter(m => m.sopId === sopId && m.status !== 'dismissed')
    .sort((a, b) => (a.happenedOn < b.happenedOn ? 1 : -1));
}

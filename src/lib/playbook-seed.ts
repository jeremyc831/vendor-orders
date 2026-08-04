/**
 * Seed content for the Playbook module: the SOP-writing template (draft) and
 * the "Close out a job" example (active) with its three starter mistakes.
 * Written once by `ensureSeeded()` in playbook-store.ts.
 */
import type { Mistake, Sop, SopRevision } from '@/types/playbook';
import { todayYMD } from '@/lib/playbook';

export interface SeedData {
  sops: Sop[];
  revisions: SopRevision[];
  mistakes: Mistake[];
}

export function buildSeedData(now: Date): SeedData {
  const iso = now.toISOString();
  const today = todayYMD(now);

  const template: Sop = {
    id: crypto.randomUUID(),
    slug: 'template-copy-me',
    title: 'TEMPLATE — copy me',
    purpose: 'Keep every SOP one page, verb-first, and owned by one person.',
    trigger: 'Starting any new SOP — hit Duplicate on this page and replace everything.',
    category: 'office',
    owner: 'Jeremy',
    steps: [
      { text: "Title: verb-first — 'Close out a job', not 'Job closeout procedure'.", required: true },
      { text: 'Owner: one name. The owner fixes the document when it fails, not just the mistake.', required: true },
      { text: 'When to use: the trigger moment, one line.', required: true },
      { text: 'Why it matters: one line, in money or callbacks if possible.', required: true },
      { text: "Steps: checkboxes, max ~10. If it needs more, it's two SOPs.", required: true },
      { text: 'Watch: 60–120 second phone video of the task done right. The video is the SOP; the steps are the reminder.', required: false },
      { text: 'Common mistakes: auto-populated from the mistake log — attach mistakes to the SOP so the document stays alive.', required: false },
      { text: 'Last reviewed: tap Mark reviewed when you re-read it. Stale after 90 days.', required: false },
    ],
    videoUrl: null,
    photoUrls: [],
    bodyMd:
      'Use Duplicate (on this page) to copy this template, then replace every line. Set status to Active when the video is shot and the steps survive one real job.',
    status: 'draft',
    version: 1,
    lastReviewedAt: iso,
    createdAt: iso,
    updatedAt: iso,
  };

  const closeout: Sop = {
    id: crypto.randomUUID(),
    slug: 'close-out-a-job',
    title: 'Close out a job',
    purpose: 'The last 15 minutes decide whether we get paid fast, get called back, or get referred.',
    trigger: 'The last 20 minutes of every job, before anyone starts the truck.',
    category: 'field',
    owner: 'Jeremy',
    steps: [
      {
        text: 'Walk the scope against the estimate — anything incomplete gets flagged to the client before we leave, not discovered by them after.',
        required: true,
      },
      {
        text: 'Photo pairs: wide shot of every work area, before/after. Minimum four photos per job.',
        required: true,
        photoPrompt: 'Wide before/after pair of every work area — minimum four photos',
      },
      { text: 'Site reset: tools loaded, debris hauled, surfaces swept. Cleaner than we found it.', required: true },
      {
        text: 'As-found vs. as-left: anything we touched — locks, gates, water, power, thermostat — goes back to as-found or gets noted for the client.',
        required: true,
      },
      { text: 'Complete the Jobber visit checklist and mark the visit done before leaving the driveway.', required: true },
      { text: 'Log materials used in the ordering system the same day — not from memory on Friday.', required: true },
      { text: 'Send the client note: photo highlights plus anything they should know.', required: false },
      { text: 'Invoice triggered within 24 hours.', required: false },
    ],
    videoUrl: null,
    photoUrls: [],
    bodyMd: 'Owner note: reassign to the lead once promoted.',
    status: 'active',
    version: 1,
    lastReviewedAt: iso,
    createdAt: iso,
    updatedAt: iso,
  };

  const seedMistake = (description: string): Mistake => ({
    id: crypto.randomUUID(),
    happenedOn: today,
    description,
    jobRef: '',
    estCost: null,
    reportedBy: 'Seed',
    status: 'converted',
    sopId: closeout.id,
    createdAt: iso,
  });

  const mistakes: Mistake[] = [
    seedMistake('After-photos missing — disputes become our word against theirs.'),
    seedMistake('Invoice sent 3+ days late — payment lands two weeks later.'),
    seedMistake("Materials logged from memory at week's end — job costing is fiction."),
  ];

  const revisionFor = (sop: Sop): SopRevision => ({
    id: crypto.randomUUID(),
    sopId: sop.id,
    version: 1,
    snapshot: sop,
    changedBy: 'Seed',
    changeNote: 'Seeded',
    createdAt: iso,
  });

  return {
    sops: [template, closeout],
    revisions: [revisionFor(template), revisionFor(closeout)],
    mistakes,
  };
}

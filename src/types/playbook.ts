export type SopCategory = 'field' | 'shop' | 'office' | 'safety';

export type SopStatus = 'draft' | 'active' | 'archived';

export interface SopStep {
  text: string;
  required: boolean;
  /** Optional prompt shown with the step, e.g. "Wide before/after of every work area" */
  photoPrompt?: string;
}

export interface Sop {
  id: string;
  /** Stable once created — encoded in printed QR cards, so never regenerated on rename. */
  slug: string;
  title: string;
  /** One line: why this matters (in money or callbacks if possible). */
  purpose: string;
  /** One line: the moment this SOP applies. */
  trigger: string;
  category: SopCategory;
  /** Plain-text name — there is no team-members table in this app. */
  owner: string;
  steps: SopStep[];
  /** Loom / unlisted YouTube link. */
  videoUrl: string | null;
  photoUrls: string[];
  /** Freeform markdown-ish notes rendered below the steps. */
  bodyMd: string;
  status: SopStatus;
  version: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SopRevision {
  id: string;
  sopId: string;
  version: number;
  /** Full copy of the SOP as of this version — the safety net that lets everyone edit. */
  snapshot: Sop;
  changedBy: string;
  changeNote: string;
  createdAt: string;
}

export type MistakeStatus = 'open' | 'converted' | 'dismissed';

export interface Mistake {
  id: string;
  /** YYYY-MM-DD */
  happenedOn: string;
  description: string;
  /** Free text — Jobber job #. Validation against the Jobber API is v2. */
  jobRef: string;
  estCost: number | null;
  reportedBy: string;
  status: MistakeStatus;
  /** Set when converted to a new SOP or attached to an existing one. */
  sopId: string | null;
  createdAt: string;
}

/** Payload accepted when creating/updating an SOP through the editor. */
export interface SopInput {
  title: string;
  purpose: string;
  trigger: string;
  category: SopCategory;
  owner: string;
  steps: SopStep[];
  videoUrl: string | null;
  photoUrls: string[];
  bodyMd: string;
  status: SopStatus;
}

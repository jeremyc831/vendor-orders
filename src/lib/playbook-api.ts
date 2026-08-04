/**
 * Request-body parsing shared by the playbook API routes. Manual validation,
 * matching the style of the other /api routes in this app.
 */
import { VALID_CATEGORIES, VALID_STATUSES } from '@/lib/playbook';
import type { SopInput } from '@/types/playbook';

/** Returns a parsed SopInput, or a string error message for a 400 response. */
export function parseSopInput(body: Record<string, unknown>): SopInput | string {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return 'Title is required';

  const category = body.category as SopInput['category'];
  if (!VALID_CATEGORIES.includes(category)) {
    return `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`;
  }
  const status = body.status as SopInput['status'];
  if (!VALID_STATUSES.includes(status)) {
    return `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`;
  }

  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const steps = rawSteps
    .filter((s): s is { text: string; required?: unknown; photoPrompt?: unknown } =>
      !!s && typeof (s as { text?: unknown }).text === 'string'
    )
    .map(s => ({
      text: s.text,
      required: !!s.required,
      ...(typeof s.photoPrompt === 'string' && s.photoPrompt.trim() ? { photoPrompt: s.photoPrompt } : {}),
    }));

  return {
    title,
    purpose: typeof body.purpose === 'string' ? body.purpose : '',
    trigger: typeof body.trigger === 'string' ? body.trigger : '',
    category,
    owner: typeof body.owner === 'string' ? body.owner : '',
    steps,
    videoUrl: typeof body.videoUrl === 'string' && body.videoUrl.trim() ? body.videoUrl : null,
    photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls.filter((u): u is string => typeof u === 'string') : [],
    bodyMd: typeof body.bodyMd === 'string' ? body.bodyMd : '',
    status,
  };
}

// Hand-maintained / GH-Actions-sync target for manually-added Travis parts.
// See docs/superpowers/specs/2026-04-21-travis-industries-ordering-design.md
// ("Manual-parts storage (hybrid KV + TS)").
//
// Entries added here via the weekly GitHub Actions sync workflow (Plan 3).
// Safe to edit by hand if needed.

import { TravisProduct } from '@/types/travis';

export const travisPartsManual: TravisProduct[] = [];

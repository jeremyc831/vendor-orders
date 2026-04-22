import { describe, it, expect } from 'vitest';
import { generateTravisPO } from '../travis-po';

describe('generateTravisPO', () => {
  it('formats as MMDDYY + suffix uppercased', () => {
    expect(generateTravisPO('2026-04-22', 'Stock')).toBe('042226STOCK');
  });

  it('strips spaces from suffix', () => {
    expect(generateTravisPO('2026-04-22', 'Job 42')).toBe('042226JOB42');
  });

  it('accepts empty suffix (prefix only)', () => {
    expect(generateTravisPO('2026-04-22', '')).toBe('042226');
  });

  it('handles single-digit month and day with zero-padding from ISO date', () => {
    expect(generateTravisPO('2026-01-05', 'Smith')).toBe('010526SMITH');
  });
});

import { describe, it, expect } from 'vitest';
import { DEFAULT_SUPPLY_SHIP_TO, DEFAULT_SUPPLY_SHIP_METHOD } from '../shipping';

describe('supply shipping defaults', () => {
  it('points to the Arnold warehouse', () => {
    expect(DEFAULT_SUPPLY_SHIP_TO).toContain('2182 Highway 4 #E540');
    expect(DEFAULT_SUPPLY_SHIP_TO).toContain('Arnold, CA 95223');
  });

  it('defaults method to UPS Ground', () => {
    expect(DEFAULT_SUPPLY_SHIP_METHOD).toBe('UPS Ground');
  });
});

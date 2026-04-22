import { describe, it, expect } from 'vitest';
import { defaultTravisDealer, DEFAULT_TRAVIS_STOVES_FREIGHT } from '../dealer';

describe('defaultTravisDealer', () => {
  it('has the CA419 dealer number', () => {
    expect(defaultTravisDealer.dealerNumber).toBe('CA419');
  });

  it('defaults payment method to Invoice', () => {
    expect(defaultTravisDealer.paymentMethod).toBe('Invoice');
  });

  it('ships stoves to the Angels Camp showroom', () => {
    expect(defaultTravisDealer.shippingAddress).toContain('2122 Highway 49');
    expect(defaultTravisDealer.shippingAddress).toContain('Angels Camp');
  });

  it('names the dealer Hibernation Stoves & Spas', () => {
    expect(defaultTravisDealer.dealerName).toBe('Hibernation Stoves & Spas');
  });
});

describe('DEFAULT_TRAVIS_STOVES_FREIGHT', () => {
  it('defaults to 0 — freight is quoted by Travis per order', () => {
    expect(DEFAULT_TRAVIS_STOVES_FREIGHT).toBe(0);
  });
});

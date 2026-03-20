import { describe, it, expect } from 'vitest';
import { createLease, isLeaseExpired, isLeaseValid } from '../lib/lease.js';

describe('createLease', () => {
  it('generates a unique lease ID', () => {
    const a = createLease();
    const b = createLease();
    expect(a.leaseId).not.toBe(b.leaseId);
    expect(a.leaseId).toMatch(/^lease-/);
  });

  it('sets expiry in the future', () => {
    const lease = createLease(5000);
    expect(lease.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(lease.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5500);
  });

  it('uses default duration when not specified', () => {
    const before = Date.now();
    const lease = createLease();
    const after = Date.now();
    // Default is 300_000ms (5 min)
    expect(lease.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);
    expect(lease.expiresAt.getTime()).toBeLessThanOrEqual(after + 300_000);
  });
});

describe('isLeaseExpired', () => {
  it('returns false for future expiry', () => {
    expect(isLeaseExpired(new Date(Date.now() + 60_000))).toBe(false);
  });

  it('returns true for past expiry', () => {
    expect(isLeaseExpired(new Date(Date.now() - 1000))).toBe(true);
  });
});

describe('isLeaseValid', () => {
  it('returns true for matching lease IDs', () => {
    expect(isLeaseValid('lease-abc', 'lease-abc')).toBe(true);
  });

  it('returns false for mismatched lease IDs', () => {
    expect(isLeaseValid('lease-abc', 'lease-xyz')).toBe(false);
  });

  it('returns false when expected is null', () => {
    expect(isLeaseValid('lease-abc', null)).toBe(false);
  });
});

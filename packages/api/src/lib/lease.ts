import { nanoid } from 'nanoid';

const DEFAULT_LEASE_DURATION_MS = 300_000; // 5 minutes

export interface Lease {
  leaseId: string;
  expiresAt: Date;
}

export function createLease(durationMs: number = DEFAULT_LEASE_DURATION_MS): Lease {
  return {
    leaseId: `lease-${nanoid(12)}`,
    expiresAt: new Date(Date.now() + durationMs),
  };
}

export function isLeaseExpired(expiresAt: Date): boolean {
  return Date.now() > expiresAt.getTime();
}

export function isLeaseValid(leaseId: string, expectedLeaseId: string | null): boolean {
  return leaseId === expectedLeaseId;
}

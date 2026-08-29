import type {
  AllowanceReferenceType,
  AllowanceTransactionType,
  LedgerActorType,
} from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type AllowanceTransactionClient = Prisma.TransactionClient;

export interface LedgerCommand {
  type: AllowanceTransactionType;
  delta: bigint;
  currency: string;
  referenceType: AllowanceReferenceType;
  referenceId: string;
  actorType: LedgerActorType;
  actorUserId: string | null;
  correlationId: string;
  metadata?: Record<string, string>;
  auditReason?: string;
}

export interface BookingAllowanceCommand {
  accountId: string;
  amountMinor: bigint;
  currency: string;
  bookingId: string;
  actorUserId: string;
  correlationId: string;
}

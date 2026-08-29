import type {
  AllowanceReferenceType,
  AllowanceTransactionType,
  LedgerActorType,
} from '../../generated/prisma/enums.js';
import type {
  AllowanceAccountResponseDto,
  AllowanceTransactionResponseDto,
} from './dto/allowance-response.dto.js';

export const allowanceAccountSelect = {
  id: true,
  employerId: true,
  employeeId: true,
  currency: true,
  currentBalanceMinor: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const allowanceTransactionSelect = {
  id: true,
  accountId: true,
  sequence: true,
  type: true,
  amountDeltaMinor: true,
  resultingBalanceMinor: true,
  currency: true,
  referenceType: true,
  referenceId: true,
  metadata: true,
  actorType: true,
  actorUserId: true,
  correlationId: true,
  createdAt: true,
} as const;

export interface AllowanceAccountRecord {
  id: string;
  employerId: string;
  employeeId: string;
  currency: string;
  currentBalanceMinor: bigint;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AllowanceTransactionRecord {
  id: string;
  accountId: string;
  sequence: number;
  type: AllowanceTransactionType;
  amountDeltaMinor: bigint;
  resultingBalanceMinor: bigint;
  currency: string;
  referenceType: AllowanceReferenceType;
  referenceId: string;
  metadata: unknown;
  actorType: LedgerActorType;
  actorUserId: string | null;
  correlationId: string;
  createdAt: Date;
}

export function mapAllowanceAccount(record: AllowanceAccountRecord): AllowanceAccountResponseDto {
  return {
    id: record.id,
    employerId: record.employerId,
    employeeId: record.employeeId,
    balanceMinor: record.currentBalanceMinor.toString(),
    currency: record.currency,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapAllowanceTransaction(
  record: AllowanceTransactionRecord,
): AllowanceTransactionResponseDto {
  return {
    ...record,
    amountDeltaMinor: record.amountDeltaMinor.toString(),
    resultingBalanceMinor: record.resultingBalanceMinor.toString(),
    metadata: isMetadataObject(record.metadata) ? record.metadata : null,
    createdAt: record.createdAt.toISOString(),
  };
}

function isMetadataObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

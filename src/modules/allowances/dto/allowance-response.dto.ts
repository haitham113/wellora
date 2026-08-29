import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../../common/pagination/pagination-meta.dto.js';
import {
  AllowanceReferenceType,
  AllowanceTransactionType,
  LedgerActorType,
} from '../../../generated/prisma/enums.js';

export class AllowanceAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employerId!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: '25000', description: 'Integer minor units serialized as a string' })
  balanceMinor!: string;

  @ApiProperty({ example: 'GBP' })
  currency!: string;

  @ApiProperty({ example: 3, description: 'Latest committed ledger sequence' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AllowanceTransactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ example: 2 })
  sequence!: number;

  @ApiProperty({ enum: AllowanceTransactionType })
  type!: AllowanceTransactionType;

  @ApiProperty({ example: '-1500', description: 'Signed integer minor units as a string' })
  amountDeltaMinor!: string;

  @ApiProperty({ example: '23500' })
  resultingBalanceMinor!: string;

  @ApiProperty({ example: 'GBP' })
  currency!: string;

  @ApiProperty({ enum: AllowanceReferenceType })
  referenceType!: AllowanceReferenceType;

  @ApiProperty({ format: 'uuid' })
  referenceId!: string;

  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ enum: LedgerActorType })
  actorType!: LedgerActorType;

  @ApiProperty({ format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ApiProperty({ example: 'request-123' })
  correlationId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AllowanceMutationResponseDto {
  @ApiProperty({ type: AllowanceAccountResponseDto })
  account!: AllowanceAccountResponseDto;

  @ApiProperty({ type: AllowanceTransactionResponseDto })
  transaction!: AllowanceTransactionResponseDto;
}

export class AllowanceTransactionPageResponseDto {
  @ApiProperty({ type: AllowanceTransactionResponseDto, isArray: true })
  data!: AllowanceTransactionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

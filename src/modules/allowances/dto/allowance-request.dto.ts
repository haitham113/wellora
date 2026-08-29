import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PageQueryDto } from '../../../common/pagination/page-query.dto.js';
import { AllowanceTransactionType } from '../../../generated/prisma/enums.js';

const positiveMinorPattern = /^[1-9][0-9]{0,18}$/;
const signedMinorPattern = /^-?[1-9][0-9]{0,18}$/;
const currencyPattern = /^[A-Z]{3}$/;

class AllowanceCreditCommandDto {
  @ApiProperty({ example: '25000', description: 'Positive integer minor units; never a float' })
  @Matches(positiveMinorPattern)
  amountMinor!: string;

  @ApiProperty({ example: 'GBP', pattern: currencyPattern.source })
  @Matches(currencyPattern)
  @IsISO4217CurrencyCode()
  currency!: string;

  @ApiProperty({ format: 'uuid', description: 'Command reference and retry identity' })
  @IsUUID('4')
  referenceId!: string;

  @ApiPropertyOptional({ example: 'Annual wellbeing benefit', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InitialAllocationDto extends AllowanceCreditCommandDto {}

export class TopUpAllowanceDto extends AllowanceCreditCommandDto {}

export class ManualAllowanceAdjustmentDto {
  @ApiProperty({
    example: '-500',
    description: 'Signed, non-zero integer minor units; never a float',
  })
  @Matches(signedMinorPattern)
  amountDeltaMinor!: string;

  @ApiProperty({ example: 'GBP', pattern: currencyPattern.source })
  @Matches(currencyPattern)
  @IsISO4217CurrencyCode()
  currency!: string;

  @ApiProperty({ format: 'uuid', description: 'Command reference and retry identity' })
  @IsUUID('4')
  referenceId!: string;

  @ApiProperty({ example: 'Correction approved by benefits lead', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ExpireAllowanceDto {
  @ApiProperty({ example: '1000', description: 'Positive amount to expire in minor units' })
  @Matches(positiveMinorPattern)
  amountMinor!: string;

  @ApiProperty({ example: 'GBP', pattern: currencyPattern.source })
  @Matches(currencyPattern)
  @IsISO4217CurrencyCode()
  currency!: string;

  @ApiProperty({ format: 'uuid', description: 'Expiration policy run or command identity' })
  @IsUUID('4')
  referenceId!: string;

  @ApiProperty({ example: '2026 annual allowance expired', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AllowanceTransactionListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AllowanceTransactionType })
  @IsOptional()
  @IsEnum(AllowanceTransactionType)
  type?: AllowanceTransactionType;
}

export class SelfAllowanceQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when the current user has allowance accounts at multiple employers',
  })
  @IsOptional()
  @IsUUID('4')
  employerId?: string;
}

export class SelfAllowanceTransactionListQueryDto extends AllowanceTransactionListQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when the current user has allowance accounts at multiple employers',
  })
  @IsOptional()
  @IsUUID('4')
  employerId?: string;
}

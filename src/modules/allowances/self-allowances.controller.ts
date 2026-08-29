import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { Authenticated } from '../../common/auth/authenticated.decorator.js';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { AllowanceQueriesService } from './allowance-queries.service.js';
import {
  SelfAllowanceQueryDto,
  SelfAllowanceTransactionListQueryDto,
} from './dto/allowance-request.dto.js';
import {
  AllowanceAccountResponseDto,
  AllowanceTransactionPageResponseDto,
} from './dto/allowance-response.dto.js';

@ApiTags('My Allowance')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@Authenticated()
@Controller('me/allowance')
export class SelfAllowancesController {
  constructor(private readonly allowances: AllowanceQueriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the current employee allowance account',
    description: 'Specify employerId when the signed-in employee belongs to multiple employers.',
  })
  @ApiOkResponse({ type: AllowanceAccountResponseDto })
  get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: SelfAllowanceQueryDto,
  ): Promise<AllowanceAccountResponseDto> {
    return this.allowances.getSelfAccount(principal, query);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List the current employee immutable allowance ledger' })
  @ApiOkResponse({ type: AllowanceTransactionPageResponseDto })
  listTransactions(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: SelfAllowanceTransactionListQueryDto,
  ): Promise<AllowanceTransactionPageResponseDto> {
    return this.allowances.listSelfTransactions(principal, query);
  }
}

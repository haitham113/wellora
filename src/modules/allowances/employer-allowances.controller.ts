import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { CurrentRequestId } from '../../common/http/current-request-id.decorator.js';
import { AllowanceQueriesService } from './allowance-queries.service.js';
import { EmployerAllowancesService } from './employer-allowances.service.js';
import {
  AllowanceTransactionListQueryDto,
  ExpireAllowanceDto,
  InitialAllocationDto,
  ManualAllowanceAdjustmentDto,
  TopUpAllowanceDto,
} from './dto/allowance-request.dto.js';
import {
  AllowanceAccountResponseDto,
  AllowanceMutationResponseDto,
  AllowanceTransactionPageResponseDto,
} from './dto/allowance-response.dto.js';

@ApiTags('Employer Allowances')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Employer tenant access denied' })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@Authenticated()
@Controller('employers/:employerId/employees/:employeeId/allowance')
export class EmployerAllowancesController {
  constructor(
    private readonly allowances: EmployerAllowancesService,
    private readonly queries: AllowanceQueriesService,
  ) {}

  @Post('initial-allocation')
  @ApiOperation({
    summary: 'Open an employee allowance account with its immutable initial allocation',
    description:
      'The referenceId is the retry identity. Currency is fixed to the employer default when the account is opened.',
  })
  @ApiCreatedResponse({ type: AllowanceMutationResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  initialAllocation(
    @CurrentPrincipal() principal: AuthPrincipal,
    @CurrentRequestId() requestId: string,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @Body() input: InitialAllocationDto,
  ): Promise<AllowanceMutationResponseDto> {
    return this.allowances.initialAllocation(principal, employerId, employeeId, input, requestId);
  }

  @Post('top-ups')
  @ApiOperation({ summary: 'Append an allowance top-up and update the cached balance atomically' })
  @ApiCreatedResponse({ type: AllowanceMutationResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  topUp(
    @CurrentPrincipal() principal: AuthPrincipal,
    @CurrentRequestId() requestId: string,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @Body() input: TopUpAllowanceDto,
  ): Promise<AllowanceMutationResponseDto> {
    return this.allowances.topUp(principal, employerId, employeeId, input, requestId);
  }

  @Post('manual-adjustments')
  @ApiOperation({
    summary: 'Append a signed manual adjustment with an atomic immutable audit record',
  })
  @ApiCreatedResponse({ type: AllowanceMutationResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  manualAdjustment(
    @CurrentPrincipal() principal: AuthPrincipal,
    @CurrentRequestId() requestId: string,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @Body() input: ManualAllowanceAdjustmentDto,
  ): Promise<AllowanceMutationResponseDto> {
    return this.allowances.manualAdjustment(principal, employerId, employeeId, input, requestId);
  }

  @Post('expirations')
  @ApiOperation({ summary: 'Append an explicit allowance expiration debit' })
  @ApiCreatedResponse({ type: AllowanceMutationResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  expire(
    @CurrentPrincipal() principal: AuthPrincipal,
    @CurrentRequestId() requestId: string,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @Body() input: ExpireAllowanceDto,
  ): Promise<AllowanceMutationResponseDto> {
    return this.allowances.expire(principal, employerId, employeeId, input, requestId);
  }

  @Get()
  @ApiOperation({ summary: 'Get an employee allowance account and current cached balance' })
  @ApiOkResponse({ type: AllowanceAccountResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getAccount(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
  ): Promise<AllowanceAccountResponseDto> {
    return this.queries.getEmployerAccount(principal, employerId, employeeId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List immutable allowance ledger entries newest sequence first' })
  @ApiOkResponse({ type: AllowanceTransactionPageResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  listTransactions(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @Query() query: AllowanceTransactionListQueryDto,
  ): Promise<AllowanceTransactionPageResponseDto> {
    return this.queries.listEmployerTransactions(principal, employerId, employeeId, query);
  }
}

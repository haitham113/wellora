import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import {
  CancelSessionDto,
  CreateOneTimeSessionDto,
  ProviderSessionListQueryDto,
  UpdateSessionDto,
} from './dto/scheduling-request.dto.js';
import {
  ProviderSessionPageResponseDto,
  ProviderSessionResponseDto,
} from './dto/scheduling-response.dto.js';
import { ProviderSessionsService } from './provider-sessions.service.js';

@ApiTags('Provider Sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Provider tenant access denied' })
@Authenticated()
@Controller('providers/:providerId/activities/:activityId/sessions')
export class ProviderActivitySessionsController {
  constructor(private readonly sessions: ProviderSessionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a one-time session in the provider timezone',
    description:
      'localStartsAt is interpreted in the provider IANA timezone. DST gaps are rejected and overlaps require an explicit policy. UTC start/end and effective cutoff are materialized for booking.',
  })
  @ApiCreatedResponse({ type: ProviderSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
    @Body() input: CreateOneTimeSessionDto,
  ): Promise<ProviderSessionResponseDto> {
    return this.sessions.create(principal, providerId, activityId, input);
  }

  @Get()
  @ApiOperation({ summary: 'List provider-owned sessions in every lifecycle state' })
  @ApiOkResponse({ type: ProviderSessionPageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  list(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
    @Query() query: ProviderSessionListQueryDto,
  ): Promise<ProviderSessionPageResponseDto> {
    return this.sessions.list(principal, providerId, activityId, query);
  }
}

@ApiTags('Provider Sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Provider tenant access denied' })
@Authenticated()
@Controller('providers/:providerId/sessions')
export class ProviderSessionsController {
  constructor(private readonly sessions: ProviderSessionsService) {}

  @Patch(':sessionId')
  @ApiOperation({
    summary: 'Update a scheduled provider session',
    description:
      'Capacity cannot fall below bookedCount. Once bookings exist, start/end cannot be changed. Version increments on every mutation.',
  })
  @ApiOkResponse({ type: ProviderSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() input: UpdateSessionDto,
  ): Promise<ProviderSessionResponseDto> {
    return this.sessions.update(principal, providerId, sessionId, input);
  }

  @Post(':sessionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an unbooked provider session',
    description:
      'The cancellation is transactional and idempotent. Until Phase 7 supplies refunds, a nonzero bookedCount fails closed and must use the future booking cancellation workflow.',
  })
  @ApiOkResponse({ type: ProviderSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  cancel(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() input: CancelSessionDto,
  ): Promise<ProviderSessionResponseDto> {
    return this.sessions.cancel(principal, providerId, sessionId, input);
  }

  @Post(':sessionId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an ended scheduled session completed' })
  @ApiOkResponse({ type: ProviderSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  complete(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<ProviderSessionResponseDto> {
    return this.sessions.complete(principal, providerId, sessionId);
  }
}

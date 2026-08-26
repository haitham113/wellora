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
  CreateActivityDto,
  ProviderActivityListQueryDto,
  UpdateActivityDto,
} from './dto/activity-request.dto.js';
import {
  ProviderActivityPageResponseDto,
  ProviderActivityResponseDto,
} from './dto/activity-response.dto.js';
import { ProviderActivitiesService } from './provider-activities.service.js';

@ApiTags('Provider Activities')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({
  type: ApiErrorResponseDto,
  description: 'Provider ownership, active membership, or required provider role denied',
})
@Authenticated()
@Controller('providers/:providerId/activities')
export class ProviderActivitiesController {
  constructor(private readonly activities: ProviderActivitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft activity owned by the provider' })
  @ApiCreatedResponse({ type: ProviderActivityResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: CreateActivityDto,
  ): Promise<ProviderActivityResponseDto> {
    return this.activities.create(principal, providerId, input);
  }

  @Get()
  @ApiOperation({ summary: 'Search, filter, sort, and paginate provider-owned activities' })
  @ApiOkResponse({ type: ProviderActivityPageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid list query' })
  list(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Query() query: ProviderActivityListQueryDto,
  ): Promise<ProviderActivityPageResponseDto> {
    return this.activities.list(principal, providerId, query);
  }

  @Get(':activityId')
  @ApiOperation({ summary: 'Get a provider-owned activity in any lifecycle state' })
  @ApiOkResponse({ type: ProviderActivityResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid resource UUID' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'ACTIVITY_NOT_FOUND' })
  get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.activities.get(principal, providerId, activityId);
  }

  @Patch(':activityId')
  @ApiOperation({
    summary: 'Update a provider-owned activity while preserving publication validity',
    description:
      'Omitted fields are retained, nullable fields are cleared with null, and a supplied media array replaces the complete media collection. Empty updates are rejected.',
  })
  @ApiOkResponse({ type: ProviderActivityResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
    @Body() input: UpdateActivityDto,
  ): Promise<ProviderActivityResponseDto> {
    return this.activities.update(principal, providerId, activityId, input);
  }

  @Post(':activityId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a complete activity or resume a paused activity',
    description:
      'Requires provider ADMIN. Repeating the request for an already-published activity is idempotent.',
  })
  @ApiOkResponse({ type: ProviderActivityResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description:
      'ACTIVITY_NOT_PUBLISHABLE, ACTIVITY_CATEGORY_INACTIVE, ACTIVITY_PROVIDER_INACTIVE, or invalid transition',
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'ACTIVITY_NOT_FOUND' })
  publish(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.activities.publish(principal, providerId, activityId);
  }

  @Post(':activityId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause a published activity and remove it from discovery',
    description:
      'Requires provider ADMIN or STAFF. Repeating the request for an already-paused activity is idempotent.',
  })
  @ApiOkResponse({ type: ProviderActivityResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'ACTIVITY_NOT_FOUND' })
  pause(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.activities.pause(principal, providerId, activityId);
  }

  @Post(':activityId/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive an activity permanently',
    description:
      'Requires provider ADMIN. Repeating the request for an archived activity is idempotent; archived activities cannot return to another state.',
  })
  @ApiOkResponse({ type: ProviderActivityResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'ACTIVITY_NOT_FOUND' })
  archive(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.activities.archive(principal, providerId, activityId);
  }
}

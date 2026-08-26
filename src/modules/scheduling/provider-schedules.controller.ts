import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { CreateScheduleTemplateDto, GenerateScheduleDto } from './dto/scheduling-request.dto.js';
import {
  ScheduleGenerationResponseDto,
  ScheduleTemplateResponseDto,
} from './dto/scheduling-response.dto.js';
import { RecurringSchedulesService } from './recurring-schedules.service.js';

@ApiTags('Provider Schedules')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Provider tenant access denied' })
@Authenticated()
@Controller('providers/:providerId/activities/:activityId/schedules')
export class ProviderSchedulesController {
  constructor(private readonly schedules: RecurringSchedulesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a finite provider-local weekly schedule template',
    description:
      'The provider IANA timezone is snapshotted. The materialization window is capped at 366 days; overlaps select EARLIER or LATER and nonexistent gap occurrences use explicit SKIP behavior.',
  })
  @ApiCreatedResponse({ type: ScheduleTemplateResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
    @Body() input: CreateScheduleTemplateDto,
  ): Promise<ScheduleTemplateResponseDto> {
    return this.schedules.create(principal, providerId, activityId, input);
  }

  @Post(':scheduleId/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Idempotently materialize a finite recurring schedule',
    description:
      'Unique (activityId, startsAt) persistence plus skipDuplicates makes retries safe. Generation never creates past or already-closed sessions.',
  })
  @ApiOkResponse({ type: ScheduleGenerationResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  generate(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
    @Param('scheduleId', new ParseUUIDPipe({ version: '4' })) scheduleId: string,
    @Body() input: GenerateScheduleDto,
  ): Promise<ScheduleGenerationResponseDto> {
    return this.schedules.generate(principal, providerId, activityId, scheduleId, input);
  }
}

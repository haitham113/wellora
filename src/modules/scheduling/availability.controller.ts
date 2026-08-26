import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../common/auth/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { AvailabilityService } from './availability.service.js';
import { AvailabilityQueryDto } from './dto/scheduling-request.dto.js';
import { SessionPageResponseDto } from './dto/scheduling-response.dto.js';

@ApiTags('Marketplace Availability')
@Public()
@Controller('activities/:activityId/sessions')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: 'Find employee-bookable activity sessions',
    description:
      'Returns only future scheduled sessions for a published activity and active provider/category. Cancelled, completed, sold-out, past-cutoff, and hidden sessions are omitted. All instants are UTC and each response retains provider-local timezone context.',
  })
  @ApiOkResponse({ type: SessionPageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'ACTIVITY_NOT_FOUND' })
  list(
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<SessionPageResponseDto> {
    return this.availability.list(activityId, query);
  }
}

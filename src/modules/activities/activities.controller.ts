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
import { PublicActivityListQueryDto } from './dto/activity-request.dto.js';
import {
  PublicActivityPageResponseDto,
  PublicActivityResponseDto,
} from './dto/activity-response.dto.js';
import { PublicActivitiesService } from './public-activities.service.js';

@ApiTags('Marketplace Activities')
@Public()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: PublicActivitiesService) {}

  @Get()
  @ApiOperation({
    summary: 'Discover valid published activities with search, filters, sorting, and pagination',
    description:
      'Returns only published activities whose provider and category are active. Price filters and price sorting require an ISO 4217 currency. Hidden and invalid catalog records are never returned.',
  })
  @ApiOkResponse({ type: PublicActivityPageResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'Invalid query, ACTIVITY_PRICE_CURRENCY_REQUIRED, or ACTIVITY_PRICE_RANGE_INVALID',
  })
  list(@Query() query: PublicActivityListQueryDto): Promise<PublicActivityPageResponseDto> {
    return this.activities.list(query);
  }

  @Get(':activityId')
  @ApiOperation({
    summary: 'Get the public details of a valid published activity',
    description:
      'Unknown, draft, paused, archived, inactive-category, and inactive-provider activities all return ACTIVITY_NOT_FOUND.',
  })
  @ApiOkResponse({ type: PublicActivityResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid activity UUID' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'ACTIVITY_NOT_FOUND' })
  get(
    @Param('activityId', new ParseUUIDPipe({ version: '4' })) activityId: string,
  ): Promise<PublicActivityResponseDto> {
    return this.activities.get(activityId);
  }
}

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

import { Role } from '../../common/auth/role.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { OrganizationStatus } from '../../generated/prisma/enums.js';
import {
  AdminUpdateProviderDto,
  CreateProviderDto,
  ProviderListQueryDto,
} from './dto/provider-request.dto.js';
import { ProviderPageResponseDto, ProviderResponseDto } from './dto/provider-response.dto.js';
import { ProvidersService } from './providers.service.js';

@ApiTags('Platform Admin — Providers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@RequireRoles(Role.PLATFORM_ADMIN)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Post()
  @ApiOperation({ summary: 'Onboard a provider and its initial administrator atomically' })
  @ApiCreatedResponse({ type: ProviderResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(@Body() input: CreateProviderDto): Promise<ProviderResponseDto> {
    return this.providers.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'Search and filter all providers with bounded pagination' })
  @ApiOkResponse({ type: ProviderPageResponseDto })
  list(@Query() query: ProviderListQueryDto): Promise<ProviderPageResponseDto> {
    return this.providers.list(query);
  }

  @Get(':providerId')
  @ApiOperation({ summary: 'Get any provider as a platform administrator' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ): Promise<ProviderResponseDto> {
    return this.providers.getAdminDetail(providerId);
  }

  @Patch(':providerId')
  @ApiOperation({ summary: 'Update any provider, including commission settings' })
  @ApiOkResponse({ type: ProviderResponseDto })
  update(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: AdminUpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return this.providers.updateAdmin(providerId, input);
  }

  @Post(':providerId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a provider' })
  @ApiOkResponse({ type: ProviderResponseDto })
  activate(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ): Promise<ProviderResponseDto> {
    return this.providers.setStatus(providerId, OrganizationStatus.ACTIVE);
  }

  @Post(':providerId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a provider and deny tenant-scoped access' })
  @ApiOkResponse({ type: ProviderResponseDto })
  deactivate(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ): Promise<ProviderResponseDto> {
    return this.providers.setStatus(providerId, OrganizationStatus.INACTIVE);
  }
}

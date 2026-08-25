import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
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
  AddProviderMemberDto,
  ProviderMemberListQueryDto,
  TenantUpdateProviderDto,
  UpdateProviderMemberDto,
} from './dto/provider-request.dto.js';
import {
  ProviderMemberPageResponseDto,
  ProviderMemberResponseDto,
  ProviderResponseDto,
} from './dto/provider-response.dto.js';
import { ProvidersService } from './providers.service.js';

@ApiTags('Providers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Tenant access denied' })
@Authenticated()
@Controller('providers/:providerId')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'Get a provider through current tenant membership' })
  @ApiOkResponse({ type: ProviderResponseDto })
  get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ): Promise<ProviderResponseDto> {
    return this.providers.getScoped(principal, providerId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update a provider as its administrator' })
  @ApiOkResponse({ type: ProviderResponseDto })
  update(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: TenantUpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return this.providers.updateScoped(principal, providerId, input);
  }

  @Get('members')
  @ApiOperation({ summary: 'Search and filter provider administrators and staff' })
  @ApiOkResponse({ type: ProviderMemberPageResponseDto })
  listMembers(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Query() query: ProviderMemberListQueryDto,
  ): Promise<ProviderMemberPageResponseDto> {
    return this.providers.listMembers(principal, providerId, query);
  }

  @Post('members')
  @ApiOperation({ summary: 'Assign or reactivate provider administrator/staff access' })
  @ApiCreatedResponse({ type: ProviderMemberResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  addMember(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: AddProviderMemberDto,
  ): Promise<ProviderMemberResponseDto> {
    return this.providers.addMember(principal, providerId, input);
  }

  @Patch('members/:membershipId')
  @ApiOperation({ summary: 'Change a provider member role with last-admin protection' })
  @ApiOkResponse({ type: ProviderMemberResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  updateMember(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
    @Body() input: UpdateProviderMemberDto,
  ): Promise<ProviderMemberResponseDto> {
    return this.providers.updateMember(principal, providerId, membershipId, input);
  }

  @Delete('members/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a provider member with last-admin protection' })
  @ApiNoContentResponse()
  deactivateMember(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
  ): Promise<void> {
    return this.providers.deactivateMember(principal, providerId, membershipId);
  }

  @Post('members/:membershipId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a provider member' })
  @ApiOkResponse({ type: ProviderMemberResponseDto })
  activateMember(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
  ): Promise<ProviderMemberResponseDto> {
    return this.providers.activateMember(principal, providerId, membershipId);
  }
}

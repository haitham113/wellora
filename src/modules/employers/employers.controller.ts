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
import { EmployeeStatus } from '../../generated/prisma/enums.js';
import {
  AddEmployerAdminDto,
  CreateEmployeeDto,
  EmployeeListQueryDto,
  EmployerAdminListQueryDto,
  TenantUpdateEmployerDto,
  UpdateEmployeeDto,
  UpdateEmployerSettingsDto,
} from './dto/employer-request.dto.js';
import {
  EmployeePageResponseDto,
  EmployeeResponseDto,
  EmployerAdminPageResponseDto,
  EmployerAdminResponseDto,
  EmployerResponseDto,
  EmployerSettingsResponseDto,
} from './dto/employer-response.dto.js';
import { EmployersService } from './employers.service.js';

@ApiTags('Employers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Tenant access denied' })
@Authenticated()
@Controller('employers/:employerId')
export class EmployersController {
  constructor(private readonly employers: EmployersService) {}

  @Get()
  @ApiOperation({ summary: 'Get an employer through current tenant membership' })
  @ApiOkResponse({ type: EmployerResponseDto })
  get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
  ): Promise<EmployerResponseDto> {
    return this.employers.getScoped(principal, employerId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update an employer as its administrator' })
  @ApiOkResponse({ type: EmployerResponseDto })
  update(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Body() input: TenantUpdateEmployerDto,
  ): Promise<EmployerResponseDto> {
    return this.employers.updateScoped(principal, employerId, input);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get typed employer operational settings' })
  @ApiOkResponse({ type: EmployerSettingsResponseDto })
  settings(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
  ): Promise<EmployerSettingsResponseDto> {
    return this.employers.getSettings(principal, employerId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update employer timezone, currency, and contact settings' })
  @ApiOkResponse({ type: EmployerSettingsResponseDto })
  updateSettings(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Body() input: UpdateEmployerSettingsDto,
  ): Promise<EmployerSettingsResponseDto> {
    return this.employers.updateSettings(principal, employerId, input);
  }

  @Get('admins')
  @ApiOperation({ summary: 'List employer administrators' })
  @ApiOkResponse({ type: EmployerAdminPageResponseDto })
  listAdmins(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Query() query: EmployerAdminListQueryDto,
  ): Promise<EmployerAdminPageResponseDto> {
    return this.employers.listAdmins(principal, employerId, query);
  }

  @Post('admins')
  @ApiOperation({ summary: 'Assign or reactivate an employer administrator' })
  @ApiCreatedResponse({ type: EmployerAdminResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  addAdmin(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Body() input: AddEmployerAdminDto,
  ): Promise<EmployerAdminResponseDto> {
    return this.employers.addAdmin(principal, employerId, input);
  }

  @Delete('admins/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate an employer administrator membership' })
  @ApiNoContentResponse()
  deactivateAdmin(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
  ): Promise<void> {
    return this.employers.deactivateAdmin(principal, employerId, membershipId);
  }

  @Post('admins/:membershipId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate an employer administrator membership' })
  @ApiOkResponse({ type: EmployerAdminResponseDto })
  activateAdmin(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
  ): Promise<EmployerAdminResponseDto> {
    return this.employers.activateAdmin(principal, employerId, membershipId);
  }

  @Get('employees')
  @ApiOperation({ summary: 'Search and filter employees within the authorized employer' })
  @ApiOkResponse({ type: EmployeePageResponseDto })
  listEmployees(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Query() query: EmployeeListQueryDto,
  ): Promise<EmployeePageResponseDto> {
    return this.employers.listEmployees(principal, employerId, query);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Create an employee in the authorized employer' })
  @ApiCreatedResponse({ type: EmployeeResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  createEmployee(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Body() input: CreateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.employers.createEmployee(principal, employerId, input);
  }

  @Get('employees/:employeeId')
  @ApiOperation({
    summary: 'Get a tenant-owned employee; employees may retrieve only their own profile',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getEmployee(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
  ): Promise<EmployeeResponseDto> {
    return this.employers.getEmployee(principal, employerId, employeeId);
  }

  @Patch('employees/:employeeId')
  @ApiOperation({ summary: 'Update an employee owned by the authorized employer' })
  @ApiOkResponse({ type: EmployeeResponseDto })
  updateEmployee(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @Body() input: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.employers.updateEmployee(principal, employerId, employeeId, input);
  }

  @Post('employees/:employeeId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate an employee and linked employee membership' })
  @ApiOkResponse({ type: EmployeeResponseDto })
  activateEmployee(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
  ): Promise<EmployeeResponseDto> {
    return this.employers.setEmployeeStatus(
      principal,
      employerId,
      employeeId,
      EmployeeStatus.ACTIVE,
    );
  }

  @Post('employees/:employeeId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate an employee and linked employee membership' })
  @ApiOkResponse({ type: EmployeeResponseDto })
  deactivateEmployee(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
  ): Promise<EmployeeResponseDto> {
    return this.employers.setEmployeeStatus(
      principal,
      employerId,
      employeeId,
      EmployeeStatus.INACTIVE,
    );
  }
}

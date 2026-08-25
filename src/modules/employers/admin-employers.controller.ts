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
  AdminUpdateEmployerDto,
  CreateEmployerDto,
  EmployerListQueryDto,
} from './dto/employer-request.dto.js';
import { EmployerPageResponseDto, EmployerResponseDto } from './dto/employer-response.dto.js';
import { EmployersService } from './employers.service.js';

@ApiTags('Platform Admin — Employers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@RequireRoles(Role.PLATFORM_ADMIN)
@Controller('admin/employers')
export class AdminEmployersController {
  constructor(private readonly employers: EmployersService) {}

  @Post()
  @ApiOperation({ summary: 'Onboard an employer and its initial administrator atomically' })
  @ApiCreatedResponse({ type: EmployerResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(@Body() input: CreateEmployerDto): Promise<EmployerResponseDto> {
    return this.employers.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'Search and filter all employers with bounded pagination' })
  @ApiOkResponse({ type: EmployerPageResponseDto })
  list(@Query() query: EmployerListQueryDto): Promise<EmployerPageResponseDto> {
    return this.employers.list(query);
  }

  @Get(':employerId')
  @ApiOperation({ summary: 'Get any employer as a platform administrator' })
  @ApiOkResponse({ type: EmployerResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
  ): Promise<EmployerResponseDto> {
    return this.employers.getAdminDetail(employerId);
  }

  @Patch(':employerId')
  @ApiOperation({ summary: 'Update any employer as a platform administrator' })
  @ApiOkResponse({ type: EmployerResponseDto })
  update(
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
    @Body() input: AdminUpdateEmployerDto,
  ): Promise<EmployerResponseDto> {
    return this.employers.updateAdmin(employerId, input);
  }

  @Post(':employerId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate an employer' })
  @ApiOkResponse({ type: EmployerResponseDto })
  activate(
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
  ): Promise<EmployerResponseDto> {
    return this.employers.setStatus(employerId, OrganizationStatus.ACTIVE);
  }

  @Post(':employerId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate an employer and deny tenant-scoped access' })
  @ApiOkResponse({ type: EmployerResponseDto })
  deactivate(
    @Param('employerId', new ParseUUIDPipe({ version: '4' })) employerId: string,
  ): Promise<EmployerResponseDto> {
    return this.employers.setStatus(employerId, OrganizationStatus.INACTIVE);
  }
}

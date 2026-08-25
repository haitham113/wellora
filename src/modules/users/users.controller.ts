import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentPrincipal } from '../../common/auth/current-principal.decorator.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Return the authenticated account' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  getMe(@CurrentPrincipal() principal: AuthPrincipal): Promise<UserResponseDto> {
    return this.usersService.getById(principal.userId);
  }
}

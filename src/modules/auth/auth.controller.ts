import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { Authenticated } from '../../common/auth/authenticated.decorator.js';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { CredentialsService } from './credentials.service.js';
import {
  ChangePasswordDto,
  EmailRequestDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth-request.dto.js';
import {
  AcceptedResponseDto,
  AuthSessionResponseDto,
  TokenPairResponseDto,
} from './dto/auth-response.dto.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { SensitiveRateLimit } from './rate-limit.decorator.js';
import { SessionMetadataService } from './session-metadata.service.js';
import { SessionService } from './session.service.js';

@ApiTags('Authentication')
@ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Request validation failed' })
@Authenticated()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly sessions: SessionService,
    private readonly oneTimeTokens: OneTimeTokenService,
    private readonly sessionMetadata: SessionMetadataService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SensitiveRateLimit('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ type: TokenPairResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto, description: 'Credentials are invalid' })
  login(@Body() input: LoginDto, @Req() request: Request): Promise<TokenPairResponseDto> {
    return this.credentials.login(
      input.email,
      input.password,
      this.sessionMetadata.fromRequest(request, input.deviceName),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SensitiveRateLimit('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new token pair' })
  @ApiOkResponse({ type: TokenPairResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'Refresh token is invalid, expired, or reused',
  })
  refresh(@Body() input: RefreshDto, @Req() request: Request): Promise<TokenPairResponseDto> {
    return this.sessions.rotate(input.refreshToken, this.sessionMetadata.fromRequest(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiNoContentResponse()
  logout(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.sessions.revokeCurrent(principal.sessionId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session for the current account' })
  @ApiNoContentResponse()
  logoutAll(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.sessions.revokeAll(principal.userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SensitiveRateLimit('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password and revoke every session and reset token' })
  @ApiNoContentResponse()
  changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() input: ChangePasswordDto,
  ): Promise<void> {
    return this.credentials.changePassword(
      principal.userId,
      input.currentPassword,
      input.newPassword,
    );
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @SensitiveRateLimit('forgot-password')
  @ApiOperation({ summary: 'Request a password-reset token without account enumeration' })
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  async forgotPassword(@Body() input: EmailRequestDto): Promise<AcceptedResponseDto> {
    await this.oneTimeTokens.requestPasswordReset(input.email);
    return { accepted: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SensitiveRateLimit('reset-password')
  @ApiOperation({ summary: 'Reset a password with a single-use token' })
  @ApiNoContentResponse()
  resetPassword(@Body() input: ResetPasswordDto): Promise<void> {
    return this.oneTimeTokens.resetPassword(input.token, input.newPassword);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SensitiveRateLimit('verify-email')
  @ApiOperation({ summary: 'Verify an email address with a single-use token' })
  @ApiNoContentResponse()
  verifyEmail(@Body() input: VerifyEmailDto): Promise<void> {
    return this.oneTimeTokens.verifyEmail(input.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @SensitiveRateLimit('resend-verification')
  @ApiOperation({ summary: 'Request another email-verification token' })
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  async resendVerification(@Body() input: EmailRequestDto): Promise<AcceptedResponseDto> {
    await this.oneTimeTokens.requestEmailVerification(input.email);
    return { accepted: true };
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current account' })
  @ApiOkResponse({ type: AuthSessionResponseDto, isArray: true })
  listSessions(@CurrentPrincipal() principal: AuthPrincipal): Promise<AuthSessionResponseDto[]> {
    return this.sessions.list(principal.userId, principal.sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one session owned by the current account' })
  @ApiNoContentResponse()
  revokeSession(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<void> {
    return this.sessions.revokeOwned(principal.userId, sessionId);
  }
}

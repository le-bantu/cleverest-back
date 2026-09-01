import { Body, Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@shared/interface/http/decorators/public.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  GetCurrentUserUseCase,
  LoginWithPasswordUseCase,
  LogoutUseCase,
  RefreshAccessTokenUseCase,
  RegisterUserUseCase,
  ResendOtpUseCase,
  VerifyOtpUseCase,
} from '../../application';
import {
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  RegisterRequest,
  ResendOtpRequest,
  VerifyOtpRequest,
} from './dto/auth.request';
import { TokenPairResponse, UserResponse } from './dto/responses';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginWithPassword: LoginWithPasswordUseCase,
    private readonly verifyOtpUc: VerifyOtpUseCase,
    private readonly resendOtpUc: ResendOtpUseCase,
    private readonly refreshUc: RefreshAccessTokenUseCase,
    private readonly logoutUc: LogoutUseCase,
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly registerUc: RegisterUserUseCase,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairResponse })
  async login(
    @Body() body: LoginRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginWithPassword.execute({ ...body, userAgent });
    if (result.otpRequired) {
      res.status(202);
      return result;
    }
    return result;
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairResponse })
  verifyOtp(@Body() body: VerifyOtpRequest, @Headers('user-agent') userAgent: string | undefined) {
    return this.verifyOtpUc.execute({ ...body, userAgent });
  }

  @Public()
  @Post('otp/resend')
  @HttpCode(200)
  resendOtp(@Body() body: ResendOtpRequest) {
    return this.resendOtpUc.execute(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairResponse })
  refresh(@Body() body: RefreshRequest, @Headers('user-agent') userAgent: string | undefined) {
    return this.refreshUc.execute({ ...body, userAgent });
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() body: LogoutRequest) {
    await this.logoutUc.execute({
      actorUserId: user.userId,
      refreshToken: body.refreshToken ?? '',
    });
  }

  @Get('me')
  @ApiOkResponse({ type: UserResponse })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.getCurrentUser.execute({ userId: user.userId });
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  register(@Body() body: RegisterRequest) {
    return this.registerUc.execute({
      email: body.email,
      password: body.password,
      role: body.role,
      phone: body.phone ?? null,
    });
  }
}

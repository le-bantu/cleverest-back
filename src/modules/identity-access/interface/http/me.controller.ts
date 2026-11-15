import { Body, Controller, Get, HttpCode, Patch, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  DeactivateOwnAccountUseCase,
  GetCurrentUserUseCase,
  ToggleTwoFactorUseCase,
  UpdateOwnProfileUseCase,
} from '../../application';
import { ToggleTwoFactorRequest, UpdateMeRequest } from './dto/me.request';
import { UserResponse } from './dto/responses';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly updateOwnProfile: UpdateOwnProfileUseCase,
    private readonly toggleTwoFactor: ToggleTwoFactorUseCase,
    private readonly deactivateOwnAccount: DeactivateOwnAccountUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: UserResponse })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.getCurrentUser.execute({ userId: user.userId });
  }

  @Put()
  @ApiOkResponse({ type: UserResponse })
  update(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateMeRequest) {
    return this.updateOwnProfile.execute({
      userId: user.userId,
      email: body.email,
      password: body.password,
      phone: body.phone,
      profile: body.profile,
    });
  }

  @Patch('2fa')
  toggle2fa(@CurrentUser() user: AuthenticatedUser, @Body() body: ToggleTwoFactorRequest) {
    return this.toggleTwoFactor.execute({ userId: user.userId, enabled: body.enabled });
  }

  @Patch('deactivate')
  @HttpCode(204)
  async deactivate(@CurrentUser() user: AuthenticatedUser) {
    await this.deactivateOwnAccount.execute({ userId: user.userId });
  }
}

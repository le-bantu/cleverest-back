import { Module } from '@nestjs/common';
import { identityInfrastructureProviders } from './infrastructure/identity-access.providers';
import { SessionIssuerService } from './application/services/session-issuer.service';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginWithPasswordUseCase } from './application/use-cases/login-with-password.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp.use-case';
import { ResendOtpUseCase } from './application/use-cases/resend-otp.use-case';
import { RefreshAccessTokenUseCase } from './application/use-cases/refresh-access-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { ListAllUsersUseCase } from './application/use-cases/list-all-users.use-case';
import { UpdateOwnProfileUseCase } from './application/use-cases/update-own-profile.use-case';
import { DeactivateOwnAccountUseCase } from './application/use-cases/deactivate-own-account.use-case';
import { ToggleTwoFactorUseCase } from './application/use-cases/toggle-two-factor.use-case';
import { IdentityFacade } from './application/identity.facade';
import { AuthController } from './interface/http/auth.controller';
import { MeController } from './interface/http/me.controller';
import { UsersController } from './interface/http/users.controller';

const useCases = [
  SessionIssuerService,
  RegisterUserUseCase,
  LoginWithPasswordUseCase,
  VerifyOtpUseCase,
  ResendOtpUseCase,
  RefreshAccessTokenUseCase,
  LogoutUseCase,
  GetCurrentUserUseCase,
  CreateUserUseCase,
  UpdateUserUseCase,
  GetUserUseCase,
  DeleteUserUseCase,
  ListUsersUseCase,
  ListAllUsersUseCase,
  UpdateOwnProfileUseCase,
  DeactivateOwnAccountUseCase,
  ToggleTwoFactorUseCase,
];

@Module({
  controllers: [AuthController, MeController, UsersController],
  providers: [...identityInfrastructureProviders, ...useCases, IdentityFacade],
  exports: [...useCases, IdentityFacade],
})
export class IdentityAccessModule {}

import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import {
  RefreshToken,
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
  RoleCatalogPort,
  ROLE_CATALOG,
  TokenIssuer,
  TOKEN_ISSUER,
  User,
} from '../../domain';
import { toUserView, UserView } from '../views/user.view';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: UserView;
}

/**
 * Application service (ports only) shared by LoginWithPassword, VerifyOtp and
 * RefreshAccessToken: expands the user's effective permissions, mints the
 * token pair and persists the refresh token.
 */
@Injectable()
export class SessionIssuerService {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(ROLE_CATALOG) private readonly roleCatalog: RoleCatalogPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issueFor(user: User, userAgent?: string | null): Promise<IssuedSession> {
    const rolePermissions = await this.roleCatalog.permissionsForRoles(user.roles);
    const effective = [...new Set([...user.directPermissions, ...rolePermissions])].sort();

    const access = await this.tokens.issueAccessToken({
      userId: user.id,
      email: user.emailValue,
      roles: user.roles,
      permissions: effective,
    });
    const refresh = await this.tokens.issueRefreshToken(user.id);

    await this.refreshTokens.save(
      RefreshToken.issue({
        id: this.refreshTokens.nextIdentity(),
        userId: user.id,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
        userAgent: userAgent ?? null,
        clock: this.clock,
      }),
    );

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresInSeconds: access.expiresInSeconds,
      user: toUserView(user, effective),
    };
  }
}

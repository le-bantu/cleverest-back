import { User } from '../../domain';

export interface ProfileView {
  kind: string;
  data: Record<string, unknown>;
}

export interface UserView {
  id: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
  roles: string[];
  permissions: string[];
  profile: ProfileView | null;
  createdAt: string;
  updatedAt: string;
}

export const toUserView = (user: User, effectivePermissions: string[]): UserView => ({
  id: user.id,
  email: user.emailValue,
  phone: user.phone,
  isActive: user.isActive,
  twoFactorEnabled: user.twoFactorEnabled,
  roles: user.roles,
  permissions: [...effectivePermissions].sort(),
  profile: user.profile
    ? {
        kind: user.profile.kind,
        data: user.profile.toPrimitives() as unknown as Record<string, unknown>,
      }
    : null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

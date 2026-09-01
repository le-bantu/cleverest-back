import { Prisma } from '@prisma/client';
import {
  AdminProfile,
  AnyProfile,
  ApporteurProfile,
  ClientProfile,
  ConsultantProfile,
  Email,
  PermissionName,
  profileKindForRole,
  Role,
  RoleName,
  User,
  UserProps,
} from '../../domain';

export const userInclude = {
  roles: { include: { role: true } },
  permissions: { include: { permission: true } },
  clientProfile: true,
  consultantProfile: true,
  adminProfile: true,
  apporteurProfile: true,
} satisfies Prisma.UserInclude;

export type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

const primaryRole = (roles: RoleName[]): RoleName => {
  for (const preference of [
    RoleName.CLIENT,
    RoleName.CONSULTANT,
    RoleName.APPORTEUR,
    RoleName.ADMIN,
    RoleName.SUPERADMIN,
  ]) {
    if (roles.includes(preference)) return preference;
  }
  return roles[0];
};

const buildProfile = (row: UserRow, roles: RoleName[]): AnyProfile | null => {
  if (roles.length === 0) return null;
  const kind = profileKindForRole(primaryRole(roles));
  switch (kind) {
    case 'client': {
      const p = row.clientProfile;
      return ClientProfile.fromPrimitives(row.id, {
        name: p?.name ?? null,
        companySize: p?.companySize ?? null,
        taxId: p?.taxId ?? null,
        activityType: p?.activityType ?? null,
        averageRevenue: p?.averageRevenue ? Number(p.averageRevenue) : null,
        companyCreationDate: p?.companyCreationDate ?? null,
        rib: p?.rib ?? null,
      });
    }
    case 'consultant': {
      const p = row.consultantProfile;
      return ConsultantProfile.fromPrimitives(row.id, {
        firstName: p?.firstName ?? null,
        lastName: p?.lastName ?? null,
        phone: p?.phone ?? null,
        email: p?.email ?? null,
        isCompany: p?.isCompany ?? false,
        taxId: p?.taxId ?? null,
        expertiseDomains: p?.expertiseDomains ?? [],
        experience: p?.experience ?? null,
        billingEntity: p?.billingEntity ?? null,
        hasAcceptedConditions: p?.hasAcceptedConditions ?? false,
        consultingContractUrl: p?.consultingContractUrl ?? null,
        rib: p?.rib ?? null,
        validated: p?.validated ?? false,
      });
    }
    case 'admin': {
      const p = row.adminProfile;
      return AdminProfile.fromPrimitives(row.id, { position: p?.position ?? null });
    }
    case 'apporteur': {
      const p = row.apporteurProfile;
      return ApporteurProfile.fromPrimitives(row.id, {
        structure: p?.structure ?? null,
        documents: p?.documents ?? [],
      });
    }
  }
};

export const userToDomain = (row: UserRow): User => {
  const roles = row.roles.map((r) => r.role.name).filter((n): n is RoleName => Role.isValid(n));
  const directPermissions = row.permissions
    .map((p) => p.permission.name)
    .filter((n): n is PermissionName =>
      Object.values(PermissionName).includes(n as PermissionName),
    );

  const props: UserProps = {
    email: row.email ? Email.create(row.email) : null,
    phone: row.phone,
    passwordHash: row.passwordHash,
    isActive: row.isActive,
    twoFactorEnabled: row.twoFactorEnabled,
    emailVerifiedAt: row.emailVerifiedAt,
    roles: new Set(roles),
    directPermissions: new Set(directPermissions),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    profile: buildProfile(row, roles),
  };
  return User.reconstitute(row.id, props);
};

export interface ProfileColumns {
  table: 'clientProfile' | 'consultantProfile' | 'adminProfile' | 'apporteurProfile';
  data: Record<string, unknown>;
}

/** Maps the aggregate's profile to the (table, columns) it persists into. */
export const profileToPersistence = (user: User): ProfileColumns | null => {
  const profile = user.profile;
  if (!profile) return null;
  const data = profile.toPrimitives() as unknown as Record<string, unknown>;
  switch (profile.kind) {
    case 'client':
      return { table: 'clientProfile', data };
    case 'consultant':
      return { table: 'consultantProfile', data };
    case 'admin':
      return { table: 'adminProfile', data };
    case 'apporteur':
      return { table: 'apporteurProfile', data };
  }
};

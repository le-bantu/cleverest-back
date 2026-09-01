import { PrismaClient } from '@prisma/client';

export const ROLE_NAMES = ['client', 'consultant', 'apporteur', 'admin', 'superadmin'] as const;

export const PERMISSION_NAMES = [
  'view-dashboard',
  'view-statistics',
  'manage-users',
  'create-user',
  'create-admin',
  'manage-quotes',
  'assign-consultants',
  'validate-deliverables',
  'validate-payments',
  'pay-consultants',
  'pay-apporteurs',
] as const;

/** Inserts roles + permissions and grants every permission to `superadmin`. */
export const seedRbac = async (prisma: PrismaClient): Promise<void> => {
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }
  for (const name of PERMISSION_NAMES) {
    await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
  }
  const superadmin = await prisma.role.findUniqueOrThrow({ where: { name: 'superadmin' } });
  const permissions = await prisma.permission.findMany();
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superadmin.id, permissionId: permission.id } },
      create: { roleId: superadmin.id, permissionId: permission.id },
      update: {},
    });
  }
};

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';

loadEnv();

const prisma = new PrismaClient();

const ROLES = ['client', 'consultant', 'apporteur', 'admin', 'superadmin'] as const;

const PERMISSIONS = [
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

async function main(): Promise<void> {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }
  for (const name of PERMISSIONS) {
    await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
  }

  // superadmin role gets every permission; admin role gets none (see analysis doc).
  const superadmin = await prisma.role.findUniqueOrThrow({ where: { name: 'superadmin' } });
  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superadmin.id, permissionId: permission.id } },
      create: { roleId: superadmin.id, permissionId: permission.id },
      update: {},
    });
  }

  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@cleverest.local';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe!2026';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      isActive: true,
      adminProfile: { create: { position: 'Owner' } },
    },
    update: { passwordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superadmin.id } },
    create: { userId: user.id, roleId: superadmin.id },
    update: {},
  });

  console.log(`Seed complete. Superadmin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

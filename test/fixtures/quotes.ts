import { PrismaClient } from '@prisma/client';

export interface SeededUser {
  id: string;
  email: string;
}

/** Creates a user with one role (+ optional consultant profile). Role rows must exist (seedRbac). */
export const createUser = async (
  prisma: PrismaClient,
  email: string,
  role: string,
  consultant?: {
    firstName?: string;
    lastName?: string;
    expertiseDomains?: string[];
    validated?: boolean;
  },
  opts: { isActive?: boolean; deletedAt?: Date | null } = {},
): Promise<SeededUser> => {
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'x',
      isActive: opts.isActive ?? true,
      deletedAt: opts.deletedAt ?? null,
      roles: { create: { roleId: roleRow.id } },
      ...(consultant ? { consultantProfile: { create: { ...consultant } } } : {}),
    },
  });
  return { id: user.id, email };
};

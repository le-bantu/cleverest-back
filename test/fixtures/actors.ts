import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedRbac } from './seed-rbac';

export const ACTOR_PASSWORD = 'Password1!';

export interface SeededActor {
  id: string;
  email: string;
  role: string;
}

export interface SeededActors {
  superadmin: SeededActor;
  admin: SeededActor;
  client: SeededActor;
  consultant: SeededActor;
}

const createActor = async (
  prisma: PrismaClient,
  email: string,
  role: string,
  passwordHash: string,
): Promise<SeededActor> => {
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      isActive: true,
      roles: { create: { roleId: roleRow.id } },
    },
  });
  return { id: user.id, email, role };
};

/** RBAC + one user per key role, all sharing ACTOR_PASSWORD. */
export const seedActors = async (prisma: PrismaClient): Promise<SeededActors> => {
  await seedRbac(prisma);
  const passwordHash = await argon2.hash(ACTOR_PASSWORD, { type: argon2.argon2id });
  return {
    superadmin: await createActor(prisma, 'superadmin@e2e.test', 'superadmin', passwordHash),
    admin: await createActor(prisma, 'admin@e2e.test', 'admin', passwordHash),
    client: await createActor(prisma, 'client@e2e.test', 'client', passwordHash),
    consultant: await createActor(prisma, 'consultant@e2e.test', 'consultant', passwordHash),
  };
};

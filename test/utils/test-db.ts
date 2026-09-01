import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export const getTestPrisma = (): PrismaClient => {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
};

export const resetDb = async (): Promise<void> => {
  const prisma = getTestPrisma();
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
};

export const disconnectTestPrisma = async (): Promise<void> => {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
};

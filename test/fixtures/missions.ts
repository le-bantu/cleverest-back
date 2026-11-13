import { PrismaClient } from '@prisma/client';

let seq = 0;

/** An EN_COURS mission (quote SIGNÉ_CLIENT + signed contract) inserted directly. */
export const insertMission = async (
  db: PrismaClient,
  clientId: string,
  consultantIds: string[] = [],
  title = 'Audit fiscal',
) => {
  const n = ++seq;
  const quote = await db.quote.create({
    data: {
      clientId,
      requestNumber: `req-${String(900 + n)}`,
      type: 'CONSULTATION',
      description: 'x',
      status: 'SIGNE_CLIENT',
    },
  });
  const contract = await db.contract.create({
    data: {
      quoteId: quote.id,
      clientId,
      originalFileKey: 'k',
      originalFileName: 'c.pdf',
      originalSize: 1,
      signed: true,
      signedAt: new Date(),
      signedFileKey: 's',
      signedFileName: 's.pdf',
      signedSize: 1,
    },
  });
  return db.mission.create({
    data: {
      contractId: contract.id,
      quoteId: quote.id,
      clientId,
      title,
      status: 'EN_COURS',
      consultants: {
        create: consultantIds.map((consultantId, i) => ({ consultantId, isLead: i === 0 })),
      },
    },
  });
};

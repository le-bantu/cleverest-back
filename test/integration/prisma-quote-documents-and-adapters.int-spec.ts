import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaQuoteRepository } from '../../src/modules/quotes/infrastructure/persistence/prisma-quote.repository';
import { PrismaQuoteDocumentRepository } from '../../src/modules/quotes/infrastructure/persistence/prisma-quote-document.repository';
import { PrismaConsultantDirectoryAdapter } from '../../src/modules/quotes/infrastructure/adapters/prisma-consultant-directory.adapter';
import { PrismaConsultantWorkloadAdapter } from '../../src/modules/quotes/infrastructure/adapters/prisma-consultant-workload.adapter';
import {
  DocumentVisibility,
  Quote,
  QuoteActor,
  QuoteDocument,
  QuoteStatus,
  QuoteType,
  RequestNumber,
  VisibleTo,
} from '../../src/modules/quotes/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';

const NOW = new Date('2026-03-01T10:00:00.000Z');
const ADMIN = { actorId: 'x', actor: QuoteActor.ADMIN };

describe('Quote documents + cross-module adapters (integration)', () => {
  const prisma = new PrismaService();
  const quotes = new PrismaQuoteRepository(prisma);
  const docs = new PrismaQuoteDocumentRepository(prisma);
  const directory = new PrismaConsultantDirectoryAdapter(prisma);
  const workload = new PrismaConsultantWorkloadAdapter(prisma);
  let client: SeededUser;
  let c1: SeededUser;
  let c2: SeededUser;
  let quote: Quote;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      expertiseDomains: ['fiscalité'],
      validated: true,
    });
    c2 = await createUser(db, 'c2@int.test', 'consultant');
    quote = Quote.create(
      {
        id: quotes.nextIdentity(),
        clientId: client.id,
        requestNumber: RequestNumber.fromSequence(1),
        type: QuoteType.CONSULTATION,
        description: 'x',
      },
      client.id,
      NOW,
    );
    quote.assignConsultants([{ consultantId: c1.id, isLead: true }], ADMIN, NOW);
    await quotes.save(quote);
  });

  const upload = (visibility: DocumentVisibility, uploadedById = client.id) =>
    QuoteDocument.upload(
      {
        id: docs.nextIdentity(),
        quoteId: quote.id,
        uploadedById,
        uploadedByRole: uploadedById === client.id ? QuoteActor.CLIENT : QuoteActor.CONSULTANT,
        path: `quotes/${quote.id}/f.pdf`,
        originalName: 'f.pdf',
        mimeType: 'application/pdf',
        size: 10,
        label: 'Brief',
        visibility,
      },
      NOW,
    );

  it.each<[VisibleTo, () => string[]]>([
    [VisibleTo.ALL, () => []],
    [VisibleTo.ADMIN, () => []],
    [VisibleTo.CONSULTANT, () => []],
    [VisibleTo.CLIENT, () => []],
    [VisibleTo.SPECIFIC, () => [c1.id, client.id]],
  ])('round-trips visibility %s with its users', async (visibleTo, users) => {
    const doc = upload(DocumentVisibility.create(visibleTo, users()));
    await docs.save(doc);
    const back = await docs.findById(doc.id);
    expect(back!.visibility.visibleTo).toBe(visibleTo);
    expect(back!.visibility.userIds.sort()).toEqual(users().sort());
    expect(back).toMatchObject({
      label: 'Brief',
      originalName: 'f.pdf',
      size: 10,
      uploadedByRole: QuoteActor.CLIENT,
    });

    const parties = { clientId: client.id, consultantIds: [c1.id] };
    const consultantSees = back!.isVisibleTo(
      { userId: c1.id, actor: QuoteActor.CONSULTANT },
      parties,
    );
    expect(consultantSees).toBe(
      [VisibleTo.ALL, VisibleTo.CONSULTANT, VisibleTo.SPECIFIC].includes(visibleTo),
    );
  });

  it('changing visibility replaces the SPECIFIC grants; listByQuote / delete', async () => {
    const doc = upload(DocumentVisibility.create('SPECIFIC', [c1.id]));
    await docs.save(doc);
    doc.changeVisibility(DocumentVisibility.create('SPECIFIC', [client.id]), {
      userId: 'a',
      actor: QuoteActor.ADMIN,
    });
    await docs.save(doc);
    expect((await docs.findById(doc.id))!.visibility.userIds).toEqual([client.id]);
    doc.changeVisibility(DocumentVisibility.create('ALL'), {
      userId: 'a',
      actor: QuoteActor.ADMIN,
    });
    await docs.save(doc);
    expect(await getTestPrisma().quoteDocumentVisibility.count()).toBe(0);

    expect((await docs.listByQuote(quote.id)).map((d) => d.id)).toEqual([doc.id]);
    await docs.delete(doc.id);
    expect(await docs.findById(doc.id)).toBeNull();
  });

  it('documents are removed when their quote is deleted', async () => {
    await docs.save(upload(DocumentVisibility.create('ALL')));
    await quotes.delete(quote.id);
    expect(await getTestPrisma().quoteDocument.count()).toBe(0);
  });

  it('ConsultantDirectory lists only active consultants with profile data', async () => {
    const db = getTestPrisma();
    await createUser(db, 'off@int.test', 'consultant', {}, { isActive: false });
    await createUser(db, 'gone@int.test', 'consultant', {}, { deletedAt: NOW });
    const list = await directory.listConsultants();
    expect(list.map((c) => c.consultantId).sort()).toEqual([c1.id, c2.id].sort());
    expect(list.find((c) => c.consultantId === c1.id)).toEqual({
      consultantId: c1.id,
      name: 'Ada Lovelace',
      expertiseDomains: ['fiscalité'],
      validated: true,
    });
    expect(list.find((c) => c.consultantId === c2.id)).toMatchObject({
      name: 'c2@int.test',
      validated: false,
    });
    expect(
      (await directory.findConsultantsByIds([c2.id, client.id])).map((c) => c.consultantId),
    ).toEqual([c2.id]);
    expect(await directory.findConsultantsByIds([])).toEqual([]);
  });

  it('ConsultantWorkload counts open quotes only', async () => {
    const second = Quote.create(
      {
        id: quotes.nextIdentity(),
        clientId: client.id,
        requestNumber: RequestNumber.fromSequence(2),
        type: QuoteType.CONSULTATION,
        description: 'y',
      },
      client.id,
      NOW,
    );
    second.assignConsultants([{ consultantId: c1.id, isLead: true }], ADMIN, NOW);
    second.reviewByAdmin({ status: QuoteStatus.REJETE }, ADMIN, NOW);
    await quotes.save(second);

    const loads = await workload.currentLoad([c1.id, c2.id]);
    expect(loads.get(c1.id)).toBe(1);
    expect(loads.has(c2.id)).toBe(false);
    expect(await workload.currentLoad([])).toEqual(new Map());
  });
});

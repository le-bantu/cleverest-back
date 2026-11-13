import { QuoteStatus as S } from '../domain';
import { aQuote, NOW } from '../testing/builders';
import { consultant, quotesTestContext } from '../testing/in-memory';
import { QuotesFacade } from './quotes.facade';

describe('QuotesFacade', () => {
  const setup = () => {
    const ctx = quotesTestContext();
    const facade = new QuotesFacade(ctx.quotes, ctx.directory, ctx.committer);
    return { ctx, facade };
  };

  it('exposes a read-only summary', async () => {
    const { ctx, facade } = setup();
    const q = aQuote()
      .withAssignments([
        { consultantId: 'c1', isLead: false },
        { consultantId: 'c2', isLead: true },
      ])
      .build();
    ctx.quotes.store.set(q.id, q);
    expect(await facade.findSummary(q.id)).toEqual({
      id: q.id,
      clientId: 'client-1',
      requestNumber: 'req-001',
      title: 'Audit fiscal',
      status: S.EN_ATTENTE,
      isSubquote: false,
      parentQuoteId: null,
      price: null,
      leadConsultantId: 'c2',
      consultantIds: ['c1', 'c2'],
    });
    expect(await facade.findSummary('nope')).toBeNull();

    const priced = aQuote().withStatus(S.VALIDE_ADMIN).withPrice(750).build();
    ctx.quotes.store.set(priced.id, priced);
    expect((await facade.findSummary(priced.id))?.price).toBe(750);
  });

  it('prepares the client signature: checks now, writes in the caller tx, audits on finalize', async () => {
    const { ctx, facade } = setup();
    const q = aQuote().withStatus(S.VALIDE_ADMIN).withPrice(100).build();
    ctx.quotes.store.set(q.id, q);
    const pending = await facade.prepareClientSignature(q.id, 'client-1', NOW);
    expect(ctx.audit.entries).toEqual([]);
    await pending.persist({ tx: 'outer' });
    expect(ctx.quotes.saves).toBe(1);
    expect(ctx.quotes.store.get(q.id)?.status).toBe(S.SIGNE_CLIENT);
    await pending.finalize();
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ fromStatus: S.VALIDE_ADMIN, toStatus: S.SIGNE_CLIENT }),
    ]);
    expect(ctx.uow.runs).toBe(0);
  });

  it('refuses an illegal signature before writing anything', async () => {
    const { ctx, facade } = setup();
    const q = aQuote().withStatus(S.COTE).withPrice(100).build();
    ctx.quotes.store.set(q.id, q);
    await expect(facade.prepareClientSignature(q.id, 'client-1', NOW)).rejects.toMatchObject({
      code: 'QUOTE_TRANSITION_NOT_ALLOWED',
    });
    await expect(facade.prepareClientSignature('nope', 'client-1', NOW)).rejects.toMatchObject({
      code: 'QUOTE_NOT_FOUND',
    });
    expect(ctx.quotes.saves).toBe(0);
  });

  it('filters existing consultants', async () => {
    const { ctx, facade } = setup();
    ctx.directory.consultants = [consultant('c1'), consultant('c2')];
    expect(await facade.existingConsultants(['c2', 'ghost'])).toEqual(['c2']);
    expect(await facade.existingConsultants([])).toEqual([]);
  });

  it('prepares a closed-deal quote: validated at the price then signed, written on persist', async () => {
    const { ctx, facade } = setup();
    const prepared = await facade.prepareClosedDealQuote(
      {
        clientId: 'client-9',
        title: 'Audit',
        description: 'Affaire apportée',
        type: 'CONSULTATION',
        price: 5000,
        adminId: 'admin-1',
      },
      NOW,
    );
    expect(prepared.validated).toMatchObject({
      clientId: 'client-9',
      status: S.VALIDE_ADMIN,
      price: 5000,
      isSubquote: false,
    });
    expect(ctx.quotes.store.size).toBe(0);
    await prepared.persist({ tx: true });
    const saved = ctx.quotes.store.get(prepared.validated.id)!;
    expect(saved.status).toBe(S.SIGNE_CLIENT);
    await prepared.finalize();
    expect(ctx.audit.entries.map((e) => e.toStatus)).toEqual(
      expect.arrayContaining([S.VALIDE_ADMIN, S.SIGNE_CLIENT]),
    );
    await expect(
      facade.prepareClosedDealQuote(
        { clientId: 'c', title: 't', description: 'd', type: 'NOPE', price: 1, adminId: 'a' },
        NOW,
      ),
    ).rejects.toMatchObject({ httpStatus: 422 });
  });
});

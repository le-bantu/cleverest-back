import {
  FixedClock,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '@shared/kernel';
import { QuoteStatus as S } from '../../domain';
import { aQuote, NOW } from '../../testing/builders';
import { actor, consultant, quotesTestContext } from '../../testing/in-memory';
import { ListAdminQuotesUseCase } from './list-admin-quotes.use-case';
import { ListConsultantQuotesUseCase } from './list-consultant-quotes.use-case';
import { ReviewClientQuoteUseCase } from './review-client-quote.use-case';
import { SubmitConsultantQuoteUseCase } from './submit-consultant-quote.use-case';
import { ValidateConsultantQuoteUseCase } from './validate-consultant-quote.use-case';
import { SplitQuoteUseCase } from './split-quote.use-case';
import { CreateSubquoteUseCase } from './create-subquote.use-case';
import { ListSubquotesUseCase } from './list-subquotes.use-case';
import { AssignConsultantsUseCase } from './assign-consultants.use-case';
import { GetConsultantShortlistUseCase } from './get-consultant-shortlist.use-case';
import { SetAdminNotesToConsultantUseCase } from './set-admin-notes-to-consultant.use-case';

const seed = (
  ctx: ReturnType<typeof quotesTestContext>,
  ...quotes: ReturnType<ReturnType<typeof aQuote>['build']>[]
) => {
  for (const q of quotes) ctx.quotes.store.set(q.id, q);
};

describe('ListAdminQuotesUseCase', () => {
  it('requires manage-quotes and applies filters', async () => {
    const ctx = quotesTestContext();
    const a = aQuote()
      .withClient('k1')
      .withValidatedAt(NOW)
      .withStatus(S.VALIDE_ADMIN)
      .withPrice(1)
      .build();
    const b = aQuote().withClient('k2').withCreatedAt(new Date('2025-01-01')).build();
    const c = aQuote().withClient('k1').asSubquoteOf(a.id).build();
    seed(ctx, a, b, c);
    const uc = new ListAdminQuotesUseCase(ctx.quotes, ctx.clock);

    expect((await uc.execute({ actor: actor.admin() })).meta.total).toBe(3);
    expect(
      (await uc.execute({ actor: actor.admin(), clientId: 'k1', isSubquote: false })).data.map(
        (q) => q.id,
      ),
    ).toEqual([a.id]);
    expect(
      (await uc.execute({ actor: actor.admin(), isValidated: true })).data.map((q) => q.id),
    ).toEqual([a.id]);
    expect(
      (await uc.execute({ actor: actor.admin(), parentQuoteId: a.id })).data.map((q) => q.id),
    ).toEqual([c.id]);
    expect(
      (
        await uc.execute({
          actor: actor.admin(),
          dateMax: new Date('2025-06-01'),
          type: 'CONSULTATION',
          status: 'EN_ATTENTE',
        })
      ).data.map((q) => q.id),
    ).toEqual([b.id]);
    await expect(uc.execute({ actor: actor.bareAdmin() })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(uc.execute({ actor: actor.client() })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ListConsultantQuotesUseCase', () => {
  it('returns only assigned quotes', async () => {
    const ctx = quotesTestContext();
    const mine = aQuote().withConsultants('c1').withStatus(S.TRAITEMENT_CONSULTANT).build();
    const other = aQuote().withConsultants('c2').build();
    seed(ctx, mine, other);
    const uc = new ListConsultantQuotesUseCase(ctx.quotes, ctx.clock);
    const page = await uc.execute({
      actor: actor.consultant('c1'),
      status: 'TRAITEMENT_CONSULTANT',
      isSubquote: false,
      isValidated: false,
    });
    expect(page.data.map((q) => q.id)).toEqual([mine.id]);
    expect(page.data[0].isLead).toBe(true);
    await expect(uc.execute({ actor: actor.client() })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ReviewClientQuoteUseCase', () => {
  const setup = (q = aQuote().build()) => {
    const ctx = quotesTestContext();
    seed(ctx, q);
    return {
      ctx,
      q,
      uc: new ReviewClientQuoteUseCase(ctx.quotes, ctx.committer, ctx.notifications, ctx.clock),
    };
  };

  it('REJETÉ without price is OK, audited, client notified', async () => {
    const { ctx, q, uc } = setup();
    const view = await uc.execute({
      actor: actor.admin(),
      quoteId: q.id,
      status: 'REJETÉ',
      rejectedReason: 'hors scope',
    });
    expect(view).toMatchObject({ status: S.REJETE, price: null, rejectedReason: 'hors scope' });
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ fromStatus: S.EN_ATTENTE, toStatus: S.REJETE, actorId: 'admin-1' }),
    ]);
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
  });

  it('VALIDÉ_ADMIN with price', async () => {
    const { q, uc } = setup();
    const view = await uc.execute({
      actor: actor.admin(),
      quoteId: q.id,
      status: 'VALIDÉ_ADMIN',
      price: 1200,
    });
    expect(view).toMatchObject({ status: S.VALIDE_ADMIN, price: 1200 });
  });

  it('TRAITEMENT_CONSULTANT notifies the consultants; notes-only writes no audit', async () => {
    const { ctx, q, uc } = setup(aQuote().withConsultants('c1', 'c2').build());
    await uc.execute({ actor: actor.admin(), quoteId: q.id, status: 'TRAITEMENT_CONSULTANT' });
    expect(ctx.notifier.recipients().sort()).toEqual(['c1', 'c2']);

    const other = setup();
    await other.uc.execute({
      actor: actor.admin(),
      quoteId: other.q.id,
      status: 'EN_ATTENTE',
      adminNotes: 'vu',
      price: null,
    });
    expect(other.ctx.audit.entries).toHaveLength(0);
    expect(other.ctx.notifier.sent).toHaveLength(0);
  });

  it('illegal transition → 409 and nothing persisted; unknown status → 422', async () => {
    const { ctx, q, uc } = setup();
    await expect(
      uc.execute({ actor: actor.admin(), quoteId: q.id, status: 'SIGNÉ_CLIENT' }),
    ).rejects.toMatchObject({ httpStatus: 409, code: 'QUOTE_TRANSITION_NOT_ALLOWED' });
    await expect(
      uc.execute({ actor: actor.admin(), quoteId: q.id, status: 'ACCEPTÉ' }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(ctx.quotes.saves).toBe(0);
  });

  it('requires manage-quotes', async () => {
    const { q, uc } = setup();
    await expect(
      uc.execute({ actor: actor.admin(['assign-consultants']), quoteId: q.id, status: 'REJETÉ' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
  });

  it('a notification failure never fails the command', async () => {
    const { ctx, q, uc } = setup();
    ctx.notifier.failFor.add('client-1');
    await expect(
      uc.execute({ actor: actor.admin(), quoteId: q.id, status: 'REJETÉ' }),
    ).resolves.toMatchObject({ status: S.REJETE });
  });
});

describe('SubmitConsultantQuoteUseCase', () => {
  const setup = (deadline: Date | null = new Date(NOW.getTime() + 3600_000)) => {
    const ctx = quotesTestContext();
    const q = aQuote()
      .withStatus(S.TRAITEMENT_CONSULTANT)
      .withConsultants('c1')
      .withConsultantDeadline(deadline)
      .build();
    seed(ctx, q);
    return { ctx, q, uc: new SubmitConsultantQuoteUseCase(ctx.quotes, ctx.committer, ctx.clock) };
  };

  it('assigned consultant prices → COTÉ (audited)', async () => {
    const { ctx, q, uc } = setup();
    const view = await uc.execute({
      actor: actor.consultant('c1'),
      quoteId: q.id,
      price: 2500,
      consultantNotes: 'détail',
    });
    expect(view).toMatchObject({ status: S.COTE, price: 2500, consultantNotes: 'détail' });
    expect(ctx.audit.entries[0]).toMatchObject({
      fromStatus: S.TRAITEMENT_CONSULTANT,
      toStatus: S.COTE,
      actorId: 'c1',
    });
  });

  it('deadline exceeded → DeadlineExceeded (422)', async () => {
    const { ctx, q } = setup(new Date(NOW.getTime() - 1000));
    const uc = new SubmitConsultantQuoteUseCase(ctx.quotes, ctx.committer, new FixedClock(NOW));
    await expect(
      uc.execute({ actor: actor.consultant('c1'), quoteId: q.id, price: 1 }),
    ).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED', httpStatus: 422 });
  });

  it('non-assigned consultant → 404; invalid price → 422; client → 403', async () => {
    const { q, uc } = setup();
    await expect(
      uc.execute({ actor: actor.consultant('c9'), quoteId: q.id, price: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      uc.execute({ actor: actor.consultant('c1'), quoteId: q.id, price: -5 }),
    ).rejects.toBeInstanceOf(ValidationException);
    await expect(
      uc.execute({ actor: actor.client(), quoteId: q.id, price: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ValidateConsultantQuoteUseCase', () => {
  const setup = (q = aQuote().withStatus(S.COTE).withConsultants('c1').withPrice(900).build()) => {
    const ctx = quotesTestContext();
    seed(ctx, q);
    return {
      ctx,
      q,
      uc: new ValidateConsultantQuoteUseCase(
        ctx.quotes,
        ctx.committer,
        ctx.notifications,
        ctx.clock,
      ),
    };
  };

  it('VALIDÉ_ADMIN notifies the client', async () => {
    const { ctx, q, uc } = setup();
    const view = await uc.execute({ actor: actor.admin(), quoteId: q.id, status: 'VALIDÉ_ADMIN' });
    expect(view.status).toBe(S.VALIDE_ADMIN);
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
  });

  it('A_REVOIR_CONSULTANT notifies consultants', async () => {
    const { ctx, q, uc } = setup();
    await uc.execute({
      actor: actor.admin(),
      quoteId: q.id,
      status: 'A_REVOIR_CONSULTANT',
      adminNotesToConsultant: 'revoir',
    });
    expect(ctx.notifier.sent).toEqual([
      expect.objectContaining({ userId: 'c1', event: expect.objectContaining({ body: 'revoir' }) }),
    ]);
  });

  it('validating a subquote does not notify the client; REJETÉ notifies nobody', async () => {
    const sub = setup(
      aQuote().asSubquoteOf('p').withStatus(S.COTE).withConsultants('c1').withPrice(1).build(),
    );
    await sub.uc.execute({ actor: actor.admin(), quoteId: sub.q.id, status: 'VALIDÉ_ADMIN' });
    expect(sub.ctx.notifier.sent).toHaveLength(0);
    const rej = setup();
    await rej.uc.execute({ actor: actor.admin(), quoteId: rej.q.id, status: 'REJETÉ' });
    expect(rej.ctx.notifier.sent).toHaveLength(0);
  });

  it('refuses when not COTÉ (409)', async () => {
    const { uc, q } = setup(aQuote().build());
    await expect(
      uc.execute({ actor: actor.admin(), quoteId: q.id, status: 'VALIDÉ_ADMIN' }),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });
});

describe('SplitQuoteUseCase / CreateSubquoteUseCase / ListSubquotesUseCase', () => {
  it('splits atomically: parent + children saved in one unit of work, numbers reserved, consultants notified', async () => {
    const ctx = quotesTestContext();
    const parent = aQuote().withSequence(5).build();
    seed(ctx, parent);
    const uc = new SplitQuoteUseCase(
      ctx.quotes,
      ctx.directory,
      ctx.committer,
      ctx.notifications,
      ctx.clock,
    );

    const view = await uc.execute({
      actor: actor.admin(),
      quoteId: parent.id,
      consultants: ['c1', 'c2'],
    });
    expect(view.status).toBe(S.TRAITEMENT_CONSULTANT);
    expect(view.subquotes.map((s) => s.requestNumber)).toEqual(['req-006', 'req-007']);
    expect(view.subquotes.every((s) => s.leadConsultantId !== null)).toBe(true);
    expect(ctx.uow.runs).toBe(1);
    expect(ctx.quotes.saves).toBe(3);
    expect(ctx.notifier.recipients()).toEqual(['c1', 'c2']);
    // parent status change + 2 creations
    expect(ctx.audit.entries.map((e) => e.action).sort()).toEqual([
      'CREATED',
      'CREATED',
      'STATUS_CHANGED',
    ]);
  });

  it('rejects unknown consultants (422) and requires assign-consultants', async () => {
    const ctx = quotesTestContext();
    const parent = aQuote().build();
    seed(ctx, parent);
    const uc = new SplitQuoteUseCase(
      ctx.quotes,
      ctx.directory,
      ctx.committer,
      ctx.notifications,
      ctx.clock,
    );
    await expect(
      uc.execute({ actor: actor.admin(), quoteId: parent.id, consultants: ['ghost'] }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_CONSULTANT' });
    await expect(
      uc.execute({
        actor: actor.admin(['manage-quotes']),
        quoteId: parent.id,
        consultants: ['c1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a manual subquote and lists subquotes with documents', async () => {
    const ctx = quotesTestContext();
    const parent = aQuote().build();
    seed(ctx, parent);
    const create = new CreateSubquoteUseCase(
      ctx.quotes,
      ctx.directory,
      ctx.committer,
      ctx.notifications,
      ctx.clock,
    );
    const sub = await create.execute({
      actor: actor.admin(),
      quoteId: parent.id,
      title: 'Volet',
      description: 'social',
      consultantId: 'c3',
    });
    expect(sub).toMatchObject({
      isSubquote: true,
      parentQuoteId: parent.id,
      leadConsultantId: 'c3',
    });
    expect(ctx.notifier.recipients()).toEqual(['c3']);

    const list = new ListSubquotesUseCase(ctx.quotes, ctx.documents, ctx.clock);
    const subs = await list.execute({ actor: actor.admin(), quoteId: parent.id });
    expect(subs).toEqual([expect.objectContaining({ id: sub.id, documents: [] })]);
    await expect(list.execute({ actor: actor.admin(), quoteId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AssignConsultantsUseCase', () => {
  it('assigns with a lead, notifies only newly assigned consultants', async () => {
    const ctx = quotesTestContext();
    const q = aQuote().withStatus(S.TRAITEMENT_CONSULTANT).withConsultants('c1').build();
    seed(ctx, q);
    const uc = new AssignConsultantsUseCase(
      ctx.quotes,
      ctx.directory,
      ctx.committer,
      ctx.notifications,
      ctx.clock,
    );
    const view = await uc.execute({
      actor: actor.admin(),
      quoteId: q.id,
      consultants: [{ id: 'c1' }, { id: 'c2', isLead: true }],
    });
    expect(view.consultants).toEqual([
      { consultantId: 'c1', isLead: false },
      { consultantId: 'c2', isLead: true },
    ]);
    expect(view.leadConsultantId).toBe('c2');
    expect(ctx.notifier.recipients()).toEqual(['c2']);
  });

  it('two leads → 422; unknown consultant → 422', async () => {
    const ctx = quotesTestContext();
    const q = aQuote().build();
    seed(ctx, q);
    const uc = new AssignConsultantsUseCase(
      ctx.quotes,
      ctx.directory,
      ctx.committer,
      ctx.notifications,
      ctx.clock,
    );
    await expect(
      uc.execute({
        actor: actor.admin(),
        quoteId: q.id,
        consultants: [
          { id: 'c1', isLead: true },
          { id: 'c2', isLead: true },
        ],
      }),
    ).rejects.toMatchObject({ code: 'MULTIPLE_LEADS' });
    await expect(
      uc.execute({ actor: actor.admin(), quoteId: q.id, consultants: [{ id: 'zz' }] }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_CONSULTANT' });
  });
});

describe('GetConsultantShortlistUseCase', () => {
  it('ranks consultants and has no side effect', async () => {
    const ctx = quotesTestContext();
    ctx.directory.consultants = [
      consultant('a', ['marketing']),
      consultant('b', ['fiscal']),
      consultant('c', ['fiscal'], false),
    ];
    ctx.workload.loads.set('b', 2);
    const q = aQuote().withDescription('audit fiscal').build();
    seed(ctx, q);
    const uc = new GetConsultantShortlistUseCase(ctx.quotes, ctx.directory, ctx.workload);

    const list = await uc.execute({ actor: actor.admin(), quoteId: q.id });
    expect(list.map((e) => e.consultantId)).toEqual(['b', 'c', 'a']);
    expect(list[0]).toMatchObject({
      expertiseMatch: ['fiscal'],
      currentLoad: 2,
      validated: true,
      score: 13,
    });
    expect(ctx.quotes.saves).toBe(0);
    expect(ctx.audit.entries).toHaveLength(0);
    expect(ctx.quotes.store.get(q.id)?.consultants).toEqual([]);
    await expect(
      uc.execute({ actor: actor.admin(['manage-quotes']), quoteId: q.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SetAdminNotesToConsultantUseCase', () => {
  it('stores the notes and notifies assigned consultants', async () => {
    const ctx = quotesTestContext();
    const q = aQuote().withConsultants('c1', 'c2').build();
    seed(ctx, q);
    const uc = new SetAdminNotesToConsultantUseCase(
      ctx.quotes,
      ctx.committer,
      ctx.notifications,
      ctx.clock,
    );
    const view = await uc.execute({
      actor: actor.admin(),
      quoteId: q.id,
      adminNotesToConsultant: 'Merci de détailler',
    });
    expect(view.adminNotesToConsultant).toBe('Merci de détailler');
    expect(ctx.notifier.recipients().sort()).toEqual(['c1', 'c2']);
  });
});

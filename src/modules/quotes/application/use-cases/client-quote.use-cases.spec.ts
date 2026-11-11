import {
  ConflictException,
  DomainException,
  ForbiddenException,
  NotFoundException,
} from '@shared/kernel';
import { QuoteStatus as S } from '../../domain';
import { aQuote } from '../../testing/builders';
import { actor, quotesTestContext } from '../../testing/in-memory';
import { CreateQuoteUseCase } from './create-quote.use-case';
import { ListMyQuotesUseCase } from './list-my-quotes.use-case';
import { GetQuoteUseCase } from './get-quote.use-case';
import { DeleteQuoteUseCase } from './delete-quote.use-case';
import { SignOrRejectQuoteUseCase } from './sign-or-reject-quote.use-case';
import { REQUEST_NUMBER_TAKEN, withRequestNumberRetry } from '../services/request-number-retry';
import { AdminQuoteDetailView, ClientQuoteView, ConsultantQuoteView } from '../views/quote.views';

describe('CreateQuoteUseCase', () => {
  it('creates an EN_ATTENTE quote with the next request number, audits and publishes', async () => {
    const ctx = quotesTestContext();
    ctx.quotes.store.set('old', aQuote().withId('old').withSequence(41).build());
    const uc = new CreateQuoteUseCase(ctx.quotes, ctx.committer, ctx.clock);

    const view = await uc.execute({
      actor: actor.client(),
      type: 'CONSULTATION',
      title: 'Audit',
      description: 'Besoin',
    });

    expect(view).toMatchObject({ status: S.EN_ATTENTE, requestNumber: 'req-042', price: null });
    expect(ctx.uow.runs).toBe(1);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        entity: 'Quote',
        action: 'CREATED',
        toStatus: S.EN_ATTENTE,
        actorId: 'client-1',
      }),
    ]);
    expect(ctx.bus.published.map((e) => e.name)).toEqual(['quotes.quote-created']);
  });

  it('only a client can create, and the type is validated', async () => {
    const ctx = quotesTestContext();
    const uc = new CreateQuoteUseCase(ctx.quotes, ctx.committer, ctx.clock);
    await expect(
      uc.execute({ actor: actor.admin(), type: 'CONSULTATION', description: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      uc.execute({ actor: actor.apporteur(), type: 'CONSULTATION', description: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      uc.execute({ actor: actor.client(), type: 'ponctuel', description: 'x' }),
    ).rejects.toMatchObject({ code: 'INVALID_QUOTE_TYPE' });
  });
});

describe('withRequestNumberRetry', () => {
  it('retries on REQUEST_NUMBER_TAKEN then gives up after 3 attempts', async () => {
    let calls = 0;
    const taken = () => new ConflictException(REQUEST_NUMBER_TAKEN, 'taken');
    await expect(
      withRequestNumberRetry(() => {
        calls++;
        return calls < 3 ? Promise.reject(taken()) : Promise.resolve('ok');
      }),
    ).resolves.toBe('ok');
    calls = 0;
    await expect(
      withRequestNumberRetry(() => {
        calls++;
        return Promise.reject(taken());
      }),
    ).rejects.toBeInstanceOf(DomainException);
    expect(calls).toBe(3);
  });
  it('does not retry other errors', async () => {
    let calls = 0;
    await expect(
      withRequestNumberRetry(() => {
        calls++;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});

describe('ListMyQuotesUseCase', () => {
  it("returns only the client's main quotes, filtered", async () => {
    const ctx = quotesTestContext();
    const mine = aQuote().withClient('client-1').build();
    const mineCote = aQuote().withClient('client-1').withStatus(S.COTE).withPrice(10).build();
    const sub = aQuote().withClient('client-1').asSubquoteOf(mine.id).build();
    const other = aQuote().withClient('client-2').build();
    for (const q of [mine, mineCote, sub, other]) ctx.quotes.store.set(q.id, q);
    const uc = new ListMyQuotesUseCase(ctx.quotes);

    const all = await uc.execute({ actor: actor.client() });
    expect(all.data.map((q) => q.id).sort()).toEqual([mine.id, mineCote.id].sort());
    // price hidden until admin validation
    expect(all.data.find((q) => q.id === mineCote.id)?.price).toBeNull();

    const filtered = await uc.execute({
      actor: actor.client(),
      status: 'COTÉ',
      type: 'CONSULTATION',
    });
    expect(filtered.data.map((q) => q.id)).toEqual([mineCote.id]);
    await expect(uc.execute({ actor: actor.consultant() })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('GetQuoteUseCase', () => {
  const setup = () => {
    const ctx = quotesTestContext();
    const parent = aQuote().withClient('client-1').withConsultants('c1').withPrice(500).build();
    const sub = aQuote().asSubquoteOf(parent.id).withConsultants('c2').build();
    ctx.quotes.store.set(parent.id, parent);
    ctx.quotes.store.set(sub.id, sub);
    return { ctx, parent, sub, uc: new GetQuoteUseCase(ctx.quotes, ctx.clock) };
  };

  it('client owner gets the filtered view (no internal notes)', async () => {
    const { uc, parent } = setup();
    const view = (await uc.execute({
      actor: actor.client(),
      quoteId: parent.id,
    })) as ClientQuoteView;
    expect(view.id).toBe(parent.id);
    expect(view).not.toHaveProperty('adminNotes');
    expect(view).not.toHaveProperty('consultantNotes');
    expect(view.price).toBeNull();
  });

  it('assigned consultant gets the consultant view with isLead', async () => {
    const { uc, parent } = setup();
    const view = (await uc.execute({
      actor: actor.consultant('c1'),
      quoteId: parent.id,
    })) as ConsultantQuoteView;
    expect(view.isLead).toBe(true);
    expect(view.price).toBe(500);
  });

  it('admin with manage-quotes gets the full view with subquotes', async () => {
    const { uc, parent, sub } = setup();
    const view = (await uc.execute({
      actor: actor.admin(),
      quoteId: parent.id,
    })) as AdminQuoteDetailView;
    expect(view.subquotes.map((s) => s.id)).toEqual([sub.id]);
    expect(view.leadConsultantId).toBe('c1');
    const subView = (await uc.execute({
      actor: actor.admin(),
      quoteId: sub.id,
    })) as AdminQuoteDetailView;
    expect(subView.subquotes).toEqual([]);
  });

  it('404 for non-owner client, non-assigned consultant, client on a subquote, unknown id', async () => {
    const { uc, parent, sub } = setup();
    await expect(
      uc.execute({ actor: actor.client('client-2'), quoteId: parent.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      uc.execute({ actor: actor.consultant('c3'), quoteId: parent.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(uc.execute({ actor: actor.client(), quoteId: sub.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(uc.execute({ actor: actor.admin(), quoteId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('a bare admin (no manage-quotes) is forbidden', async () => {
    const { uc, parent } = setup();
    await expect(
      uc.execute({ actor: actor.bareAdmin(), quoteId: parent.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('DeleteQuoteUseCase', () => {
  const setup = () => {
    const ctx = quotesTestContext();
    return {
      ctx,
      uc: new DeleteQuoteUseCase(ctx.quotes, ctx.documents, ctx.storage, ctx.committer),
    };
  };

  it('client deletes own pending quote, audited', async () => {
    const { ctx, uc } = setup();
    const q = aQuote().build();
    ctx.quotes.store.set(q.id, q);
    await uc.execute({ actor: actor.client(), quoteId: q.id });
    expect(ctx.quotes.store.has(q.id)).toBe(false);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ action: 'DELETED', entityId: q.id }),
    ]);
  });

  it('client cannot delete once subquotes exist or status moved', async () => {
    const { ctx, uc } = setup();
    const q = aQuote().build();
    const sub = aQuote().asSubquoteOf(q.id).build();
    ctx.quotes.store.set(q.id, q);
    ctx.quotes.store.set(sub.id, sub);
    await expect(uc.execute({ actor: actor.client(), quoteId: q.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('admin deletes a quote with its subquotes and stored files', async () => {
    const { ctx, uc } = setup();
    const q = aQuote().withStatus(S.TRAITEMENT_CONSULTANT).build();
    const sub = aQuote().asSubquoteOf(q.id).build();
    ctx.quotes.store.set(q.id, q);
    ctx.quotes.store.set(sub.id, sub);
    const { aDocument } = await import('../../testing/builders');
    const doc = aDocument({ quoteId: sub.id });
    ctx.documents.store.set(doc.id, doc);
    ctx.storage.files.set(doc.path, Buffer.from('x'));

    await uc.execute({ actor: actor.admin(), quoteId: q.id });
    expect(ctx.quotes.store.size).toBe(0);
    expect(ctx.storage.files.size).toBe(0);
    expect(ctx.audit.entries.map((e) => e.entityId).sort()).toEqual([q.id, sub.id].sort());
  });

  it('a bare admin and a stranger are forbidden', async () => {
    const { ctx, uc } = setup();
    const q = aQuote().build();
    ctx.quotes.store.set(q.id, q);
    await expect(uc.execute({ actor: actor.bareAdmin(), quoteId: q.id })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      uc.execute({ actor: actor.client('client-2'), quoteId: q.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SignOrRejectQuoteUseCase', () => {
  const setup = (status = S.VALIDE_ADMIN) => {
    const ctx = quotesTestContext();
    const q = aQuote().withStatus(status).withPrice(800).build();
    ctx.quotes.store.set(q.id, q);
    return { ctx, q, uc: new SignOrRejectQuoteUseCase(ctx.quotes, ctx.committer, ctx.clock) };
  };

  it('sign → SIGNÉ_CLIENT with audit row and visible price', async () => {
    const { ctx, q, uc } = setup();
    const view = await uc.execute({ actor: actor.client(), quoteId: q.id, action: 'sign' });
    expect(view.status).toBe(S.SIGNE_CLIENT);
    expect(view.price).toBe(800);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        action: 'STATUS_CHANGED',
        fromStatus: S.VALIDE_ADMIN,
        toStatus: S.SIGNE_CLIENT,
      }),
    ]);
  });

  it('reject → REJETÉ with reason', async () => {
    const { q, uc } = setup();
    const view = await uc.execute({
      actor: actor.client(),
      quoteId: q.id,
      action: 'reject',
      rejectedReason: 'cher',
    });
    expect(view).toMatchObject({ status: S.REJETE, rejectedReason: 'cher' });
  });

  it('non-owner gets 404, illegal transition 409, bad action 422', async () => {
    const { q, uc } = setup();
    await expect(
      uc.execute({ actor: actor.client('client-2'), quoteId: q.id, action: 'sign' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      uc.execute({ actor: actor.client(), quoteId: q.id, action: 'nope' as never }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    const pending = setup(S.COTE);
    await expect(
      pending.uc.execute({ actor: actor.client(), quoteId: pending.q.id, action: 'sign' }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(pending.ctx.quotes.saves).toBe(0);
  });
});

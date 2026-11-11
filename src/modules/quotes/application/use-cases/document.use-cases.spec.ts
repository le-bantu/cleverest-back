import { ForbiddenException, NotFoundException, ValidationException } from '@shared/kernel';
import { DocumentVisibility, QuoteActor } from '../../domain';
import { aDocument, aQuote } from '../../testing/builders';
import { actor, quotesTestContext } from '../../testing/in-memory';
import { UploadQuoteDocumentUseCase } from './upload-quote-document.use-case';
import { ListQuoteDocumentsUseCase } from './list-quote-documents.use-case';
import { DownloadQuoteDocumentUseCase } from './download-quote-document.use-case';
import { DeleteQuoteDocumentUseCase } from './delete-quote-document.use-case';
import { SetDocumentVisibilityUseCase } from './set-document-visibility.use-case';

const file = (name = 'brief.pdf') => ({
  buffer: Buffer.from('%PDF-1.4'),
  originalName: name,
  mimeType: 'application/pdf',
  size: 8,
});

const setup = () => {
  const ctx = quotesTestContext();
  const quote = aQuote().withClient('client-1').withConsultants('c1').build();
  ctx.quotes.store.set(quote.id, quote);
  return {
    ctx,
    quote,
    upload: new UploadQuoteDocumentUseCase(
      ctx.quotes,
      ctx.documents,
      ctx.storage,
      ctx.notifications,
      ctx.clock,
    ),
    list: new ListQuoteDocumentsUseCase(ctx.quotes, ctx.documents),
    download: new DownloadQuoteDocumentUseCase(ctx.quotes, ctx.documents, ctx.storage),
    remove: new DeleteQuoteDocumentUseCase(ctx.quotes, ctx.documents, ctx.storage),
    visibility: new SetDocumentVisibilityUseCase(ctx.quotes, ctx.documents),
  };
};

describe('UploadQuoteDocumentUseCase', () => {
  it('stores the file under quotes/<id>/, defaults visibility to the uploader audience, notifies', async () => {
    const { ctx, quote, upload } = setup();
    const view = await upload.execute({
      actor: actor.client(),
      quoteId: quote.id,
      file: file(),
      label: 'Brief',
    });
    expect(view).toMatchObject({
      uploadedByRole: QuoteActor.CLIENT,
      visibleTo: 'CLIENT',
      label: 'Brief',
    });
    const [key] = [...ctx.storage.files.keys()];
    expect(key).toBe(`quotes/${quote.id}/${view.id}.pdf`);
    expect(ctx.notifier.sent).toHaveLength(0); // CLIENT visibility: only the uploader (not notified)

    await upload.execute({
      actor: actor.admin(),
      quoteId: quote.id,
      file: file(),
      visibility: 'ALL',
    });
    expect(ctx.notifier.recipients().sort()).toEqual(['c1', 'client-1']);
  });

  it('validates SPECIFIC users against the quote parties', async () => {
    const { quote, upload } = setup();
    await expect(
      upload.execute({
        actor: actor.admin(),
        quoteId: quote.id,
        file: file(),
        visibility: 'SPECIFIC',
        visibleUsers: ['stranger'],
      }),
    ).rejects.toMatchObject({ code: 'VISIBILITY_USERS_INVALID' });
    const ok = await upload.execute({
      actor: actor.admin(),
      quoteId: quote.id,
      file: file(),
      visibility: 'SPECIFIC',
      visibleUsers: ['c1'],
    });
    expect(ok.visibleUsers).toEqual(['c1']);
  });

  it('refuses outsiders (404) and cleans the stored file when persistence fails', async () => {
    const { ctx, quote, upload } = setup();
    await expect(
      upload.execute({ actor: actor.consultant('c9'), quoteId: quote.id, file: file() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    ctx.documents.failNextSave = true;
    await expect(
      upload.execute({ actor: actor.client(), quoteId: quote.id, file: file('x') }),
    ).rejects.toThrow('db down');
    expect(ctx.storage.files.size).toBe(0);
  });

  it('rejects empty files', async () => {
    const { quote, upload } = setup();
    await expect(
      upload.execute({ actor: actor.client(), quoteId: quote.id, file: { ...file(), size: 0 } }),
    ).rejects.toBeInstanceOf(ValidationException);
  });
});

describe('List / Download / Delete documents', () => {
  const seedDocs = (ctx: ReturnType<typeof setup>['ctx'], quoteId: string) => {
    const adminOnly = aDocument({ quoteId, visibility: DocumentVisibility.create('ADMIN') });
    const forAll = aDocument({ quoteId, visibility: DocumentVisibility.create('ALL') });
    const byConsultant = aDocument({
      quoteId,
      uploadedById: 'c1',
      uploadedByRole: QuoteActor.CONSULTANT,
      visibility: DocumentVisibility.create('CONSULTANT'),
    });
    for (const d of [adminOnly, forAll, byConsultant]) {
      ctx.documents.store.set(d.id, d);
      ctx.storage.files.set(d.path, Buffer.from('content'));
    }
    return { adminOnly, forAll, byConsultant };
  };

  it('lists per visibility: client does not see ADMIN docs; admin sees all', async () => {
    const { ctx, quote, list } = setup();
    const { forAll, byConsultant } = seedDocs(ctx, quote.id);
    expect(
      (await list.execute({ actor: actor.client(), quoteId: quote.id })).map((d) => d.id),
    ).toEqual([forAll.id]);
    expect(
      (await list.execute({ actor: actor.consultant('c1'), quoteId: quote.id }))
        .map((d) => d.id)
        .sort(),
    ).toEqual([forAll.id, byConsultant.id].sort());
    expect(await list.execute({ actor: actor.admin([]), quoteId: quote.id })).toHaveLength(3);
  });

  it('download applies the same rule', async () => {
    const { ctx, quote, download } = setup();
    const { adminOnly, forAll } = seedDocs(ctx, quote.id);
    const got = await download.execute({
      actor: actor.client(),
      quoteId: quote.id,
      documentId: forAll.id,
    });
    expect(got).toMatchObject({ fileName: 'file.pdf', mimeType: 'application/pdf' });
    expect(got.content.toString()).toBe('content');
    await expect(
      download.execute({ actor: actor.client(), quoteId: quote.id, documentId: adminOnly.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      download.execute({ actor: actor.admin(), quoteId: 'other', documentId: forAll.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete: uploader or admin only; file removed', async () => {
    const { ctx, quote, remove } = setup();
    const { forAll, byConsultant } = seedDocs(ctx, quote.id);
    await expect(
      remove.execute({ actor: actor.client(), quoteId: quote.id, documentId: forAll.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await remove.execute({
      actor: actor.consultant('c1'),
      quoteId: quote.id,
      documentId: byConsultant.id,
    });
    expect(ctx.documents.store.has(byConsultant.id)).toBe(false);
    expect(ctx.storage.files.has(byConsultant.path)).toBe(false);
    await expect(
      remove.execute({ actor: actor.admin(), quoteId: quote.id, documentId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SetDocumentVisibilityUseCase', () => {
  it('admin changes visibility (SPECIFIC validated against parties)', async () => {
    const { ctx, quote, visibility } = setup();
    const doc = aDocument({ quoteId: quote.id, visibility: DocumentVisibility.create('ADMIN') });
    ctx.documents.store.set(doc.id, doc);
    const view = await visibility.execute({
      actor: actor.admin([]),
      documentId: doc.id,
      visibleTo: 'SPECIFIC',
      visibleUsers: ['client-1'],
    });
    expect(view).toMatchObject({ visibleTo: 'SPECIFIC', visibleUsers: ['client-1'] });
    await expect(
      visibility.execute({
        actor: actor.admin([]),
        documentId: doc.id,
        visibleTo: 'SPECIFIC',
        visibleUsers: ['x'],
      }),
    ).rejects.toMatchObject({ code: 'VISIBILITY_USERS_INVALID' });
    await expect(
      visibility.execute({ actor: actor.client(), documentId: doc.id, visibleTo: 'ALL' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      visibility.execute({ actor: actor.admin(), documentId: 'nope', visibleTo: 'ALL' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const all = await visibility.execute({
      actor: actor.admin(),
      documentId: doc.id,
      visibleTo: 'ALL',
    });
    expect(all.visibleTo).toBe('ALL');
  });
});

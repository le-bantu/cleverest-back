import { ForbiddenException, ValidationException } from '@shared/kernel';
import { aDocument, NOW } from '../../testing/builders';
import { DocumentVisibility, VisibleTo } from '../value-objects/document-visibility.vo';
import { QuoteActor } from '../value-objects/quote-status.vo';
import { DOCUMENT_MAX_BYTES, QuoteDocument } from './quote-document.entity';

const upload = (over: Partial<Parameters<typeof QuoteDocument.upload>[0]> = {}) =>
  QuoteDocument.upload(
    {
      id: 'd1',
      quoteId: 'q1',
      uploadedById: 'client-1',
      uploadedByRole: QuoteActor.CLIENT,
      path: 'quotes/q1/d1.pdf',
      originalName: 'brief.pdf',
      mimeType: 'application/pdf',
      size: 100,
      ...over,
    },
    NOW,
  );

const parties = { clientId: 'client-1', consultantIds: ['c1'] };

describe('QuoteDocument', () => {
  it('defaults visibility to the uploader audience and trims label/comment', () => {
    const doc = upload({ label: ' Brief ', comment: '  ' });
    expect(doc.visibility.visibleTo).toBe(VisibleTo.CLIENT);
    expect(doc.label).toBe('Brief');
    expect(doc.comment).toBeNull();
    expect(doc.createdAt).toEqual(NOW);
    expect(doc).toMatchObject({
      quoteId: 'q1',
      uploadedById: 'client-1',
      uploadedByRole: QuoteActor.CLIENT,
      path: 'quotes/q1/d1.pdf',
      originalName: 'brief.pdf',
      mimeType: 'application/pdf',
      size: 100,
    });
  });

  it('rejects empty / oversized files and overlong label/comment', () => {
    expect(() => upload({ size: 0 })).toThrow(ValidationException);
    expect(() => upload({ size: DOCUMENT_MAX_BYTES + 1 })).toThrow(ValidationException);
    expect(() => upload({ label: 'x'.repeat(256) })).toThrow(ValidationException);
    expect(() => upload({ comment: 'x'.repeat(1001) })).toThrow(ValidationException);
  });

  it('the uploader and admins always see it, even with ADMIN visibility', () => {
    const doc = upload({ visibility: DocumentVisibility.create('ADMIN') });
    expect(doc.isVisibleTo({ userId: 'client-1', actor: QuoteActor.CLIENT }, parties)).toBe(true);
    expect(doc.isVisibleTo({ userId: 'any', actor: QuoteActor.ADMIN }, parties)).toBe(true);
    expect(doc.isVisibleTo({ userId: 'c1', actor: QuoteActor.CONSULTANT }, parties)).toBe(false);
  });

  it('a client does not see an admin document', () => {
    const doc = aDocument({ visibility: DocumentVisibility.create('ADMIN') });
    expect(doc.isVisibleTo({ userId: 'client-1', actor: QuoteActor.CLIENT }, parties)).toBe(false);
  });

  it('only the uploader or an admin may delete', () => {
    const doc = upload();
    expect(() =>
      doc.assertDeletableBy({ userId: 'client-1', actor: QuoteActor.CLIENT }),
    ).not.toThrow();
    expect(() => doc.assertDeletableBy({ userId: 'a', actor: QuoteActor.ADMIN })).not.toThrow();
    expect(() => doc.assertDeletableBy({ userId: 'c1', actor: QuoteActor.CONSULTANT })).toThrow(
      ForbiddenException,
    );
  });

  it('only an admin may change visibility', () => {
    const doc = upload();
    doc.changeVisibility(DocumentVisibility.create('ALL'), {
      userId: 'a',
      actor: QuoteActor.ADMIN,
    });
    expect(doc.visibility.visibleTo).toBe(VisibleTo.ALL);
    expect(() =>
      doc.changeVisibility(DocumentVisibility.create('ADMIN'), {
        userId: 'client-1',
        actor: QuoteActor.CLIENT,
      }),
    ).toThrow(ForbiddenException);
  });

  it('builds a download name from the label, keeping the file extension', () => {
    expect(aDocument({ label: null, originalName: 'a.pdf' }).downloadName).toBe('a.pdf');
    expect(aDocument({ label: 'Contrat', originalName: 'a.pdf' }).downloadName).toBe('Contrat.pdf');
    expect(aDocument({ label: 'Annexe.docx', originalName: 'a.pdf' }).downloadName).toBe(
      'Annexe.docx',
    );
    expect(aDocument({ label: 'Sans ext', originalName: 'noext' }).downloadName).toBe('Sans ext');
  });
});

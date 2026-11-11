import { AbstractEntity, ForbiddenException, ValidationException } from '@shared/kernel';
import {
  DocumentViewer,
  DocumentVisibility,
  QuoteParties,
} from '../value-objects/document-visibility.vo';
import { QuoteActor } from '../value-objects/quote-status.vo';

export interface QuoteDocumentProps {
  id: string;
  quoteId: string;
  uploadedById: string;
  uploadedByRole: QuoteActor;
  label: string | null;
  /** storage key (never a filesystem path) */
  path: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  comment: string | null;
  visibility: DocumentVisibility;
  createdAt: Date;
}

export const DOCUMENT_LABEL_MAX = 255;
export const DOCUMENT_COMMENT_MAX = 1000;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const clean = (value: string | null | undefined, max: number, code: string): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new ValidationException(code, `Must be at most ${max} characters`);
  }
  return trimmed;
};

/**
 * A file attached to a quote. Separate aggregate from `Quote` (documents are
 * added/removed independently and never change the quote's state).
 */
export class QuoteDocument extends AbstractEntity<string> {
  private props: QuoteDocumentProps;

  private constructor(props: QuoteDocumentProps) {
    super(props.id);
    this.props = props;
  }

  static upload(
    input: Omit<QuoteDocumentProps, 'createdAt' | 'visibility' | 'label' | 'comment'> & {
      label?: string | null;
      comment?: string | null;
      visibility?: DocumentVisibility | null;
    },
    now: Date,
  ): QuoteDocument {
    if (input.size <= 0) {
      throw new ValidationException('DOCUMENT_EMPTY', 'The uploaded file is empty');
    }
    if (input.size > DOCUMENT_MAX_BYTES) {
      throw new ValidationException('DOCUMENT_TOO_LARGE', 'The uploaded file exceeds 10 MB');
    }
    return new QuoteDocument({
      ...input,
      label: clean(input.label, DOCUMENT_LABEL_MAX, 'DOCUMENT_LABEL_TOO_LONG'),
      comment: clean(input.comment, DOCUMENT_COMMENT_MAX, 'DOCUMENT_COMMENT_TOO_LONG'),
      visibility: input.visibility ?? DocumentVisibility.defaultFor(input.uploadedByRole),
      createdAt: now,
    });
  }

  static rehydrate(props: QuoteDocumentProps): QuoteDocument {
    return new QuoteDocument(props);
  }

  get quoteId(): string {
    return this.props.quoteId;
  }
  get uploadedById(): string {
    return this.props.uploadedById;
  }
  get uploadedByRole(): QuoteActor {
    return this.props.uploadedByRole;
  }
  get label(): string | null {
    return this.props.label;
  }
  get path(): string {
    return this.props.path;
  }
  get originalName(): string {
    return this.props.originalName;
  }
  get mimeType(): string | null {
    return this.props.mimeType;
  }
  get size(): number {
    return this.props.size;
  }
  get comment(): string | null {
    return this.props.comment;
  }
  get visibility(): DocumentVisibility {
    return this.props.visibility;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Admins and the uploader always see it; everybody else per visibility rule. */
  isVisibleTo(viewer: DocumentViewer, parties: QuoteParties): boolean {
    if (viewer.actor === QuoteActor.ADMIN) return true;
    if (viewer.userId === this.props.uploadedById) return true;
    return this.props.visibility.allows(viewer, parties);
  }

  /** Only the uploader or an admin may delete a document. */
  assertDeletableBy(viewer: DocumentViewer): void {
    if (viewer.actor !== QuoteActor.ADMIN && viewer.userId !== this.props.uploadedById) {
      throw new ForbiddenException(
        'DOCUMENT_DELETE_FORBIDDEN',
        'Only the uploader or an administrator can delete this document',
      );
    }
  }

  changeVisibility(visibility: DocumentVisibility, viewer: DocumentViewer): void {
    if (viewer.actor !== QuoteActor.ADMIN) {
      throw new ForbiddenException('ADMIN_ONLY', 'Only an administrator can change visibility');
    }
    this.props.visibility = visibility;
  }

  /** File name offered on download: label (with the original extension) or original name. */
  get downloadName(): string {
    const ext = /\.[A-Za-z0-9]{1,10}$/.exec(this.props.originalName)?.[0] ?? '';
    if (!this.props.label) return this.props.originalName;
    return /\.[A-Za-z0-9]{1,10}$/.test(this.props.label)
      ? this.props.label
      : this.props.label + ext;
  }
}

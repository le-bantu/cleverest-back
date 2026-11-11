import { AbstractValueObject, ValidationException } from '@shared/kernel';
import { QuoteActor } from './quote-status.vo';

export enum VisibleTo {
  ALL = 'ALL',
  ADMIN = 'ADMIN',
  CONSULTANT = 'CONSULTANT',
  CLIENT = 'CLIENT',
  SPECIFIC = 'SPECIFIC',
}

export const ALL_VISIBLE_TO: readonly VisibleTo[] = Object.values(VisibleTo);

/** Who is looking at a document, and the parties of the quote it belongs to. */
export interface DocumentViewer {
  userId: string;
  actor: QuoteActor;
}

export interface QuoteParties {
  clientId: string;
  consultantIds: readonly string[];
}

interface Props {
  visibleTo: VisibleTo;
  userIds: string[];
}

/**
 * Visibility rule of a quote document. Admins and the uploader always see a
 * document (enforced by `QuoteDocument.isVisibleTo`); this VO decides for
 * everybody else.
 */
export class DocumentVisibility extends AbstractValueObject<Props> {
  private constructor(props: Props) {
    super(props);
  }

  static create(visibleTo: string, userIds: readonly string[] = []): DocumentVisibility {
    if (!(ALL_VISIBLE_TO as string[]).includes(visibleTo)) {
      throw new ValidationException('INVALID_VISIBILITY', `Unknown visibility "${visibleTo}"`);
    }
    const unique = [...new Set(userIds)];
    if (visibleTo === VisibleTo.SPECIFIC && unique.length === 0) {
      throw new ValidationException(
        'VISIBILITY_USERS_REQUIRED',
        'SPECIFIC visibility requires at least one user',
      );
    }
    return new DocumentVisibility({
      visibleTo: visibleTo as VisibleTo,
      userIds: visibleTo === VisibleTo.SPECIFIC ? unique : [],
    });
  }

  /** Legacy default when the uploader does not choose: their own audience. */
  static defaultFor(actor: QuoteActor): DocumentVisibility {
    switch (actor) {
      case QuoteActor.ADMIN:
        return DocumentVisibility.create(VisibleTo.ADMIN);
      case QuoteActor.CLIENT:
        return DocumentVisibility.create(VisibleTo.CLIENT);
      default:
        return DocumentVisibility.create(VisibleTo.CONSULTANT);
    }
  }

  get visibleTo(): VisibleTo {
    return this.props.visibleTo;
  }

  get userIds(): string[] {
    return [...this.props.userIds];
  }

  allows(viewer: DocumentViewer, parties: QuoteParties): boolean {
    if (viewer.actor === QuoteActor.ADMIN) return true;
    const isClient = viewer.actor === QuoteActor.CLIENT && viewer.userId === parties.clientId;
    const isConsultant =
      viewer.actor === QuoteActor.CONSULTANT && parties.consultantIds.includes(viewer.userId);
    switch (this.props.visibleTo) {
      case VisibleTo.ALL:
        return isClient || isConsultant;
      case VisibleTo.CLIENT:
        return isClient;
      case VisibleTo.CONSULTANT:
        return isConsultant;
      case VisibleTo.SPECIFIC:
        return (isClient || isConsultant) && this.props.userIds.includes(viewer.userId);
      default:
        return false;
    }
  }
}

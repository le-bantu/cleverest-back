import { ForbiddenException } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { QuoteActor, QuoteActorRef, quoteActorFromRoles } from '../../domain';

export const QUOTE_PERMISSIONS = {
  MANAGE: 'manage-quotes',
  ASSIGN: 'assign-consultants',
} as const;

/** Resolves the domain actor from the authenticated user; refuses other roles. */
export const toActorRef = (actor: ActorContext): QuoteActorRef => {
  const kind = quoteActorFromRoles(actor.roles);
  if (!kind) {
    throw new ForbiddenException('QUOTE_ROLE_REQUIRED', 'This role cannot act on quotes');
  }
  return { actorId: actor.userId, actor: kind };
};

/** Requires a specific actor kind (e.g. only clients create quotes). */
export const requireActor = (actor: ActorContext, kind: QuoteActor): QuoteActorRef => {
  const ref = toActorRef(actor);
  if (ref.actor !== kind) {
    throw new ForbiddenException('QUOTE_ROLE_REQUIRED', `Only a ${kind.toLowerCase()} can do this`);
  }
  return ref;
};

/** Admin actor holding the given permission (superadmin holds them all through its role). */
export const requireAdminWith = (actor: ActorContext, permission: string): QuoteActorRef => {
  const ref = requireActor(actor, QuoteActor.ADMIN);
  if (!actor.permissions.includes(permission)) {
    throw new ForbiddenException('PERMISSION_REQUIRED', `Missing permission "${permission}"`, {
      permission,
    });
  }
  return ref;
};

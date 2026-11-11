import { ForbiddenException } from '@shared/kernel';
import { ActorContext } from './use-case';

/** Coarse audience of an authenticated user, as business rules see it. */
export type ActorKind = 'ADMIN' | 'CONSULTANT' | 'CLIENT';

export interface ActorRef {
  userId: string;
  kind: ActorKind;
}

/** admin/superadmin → ADMIN, then consultant, then client (same priority as quotes). */
export const actorKindOf = (roles: readonly string[]): ActorKind | null => {
  if (roles.includes('admin') || roles.includes('superadmin')) return 'ADMIN';
  if (roles.includes('consultant')) return 'CONSULTANT';
  if (roles.includes('client')) return 'CLIENT';
  return null;
};

/** Resolves the actor and refuses any audience not listed (403 ROLE_NOT_ALLOWED). */
export const resolveActor = (
  actor: ActorContext,
  allowed: readonly ActorKind[] = ['ADMIN', 'CONSULTANT', 'CLIENT'],
): ActorRef => {
  const kind = actorKindOf(actor.roles);
  if (!kind || !allowed.includes(kind)) {
    throw new ForbiddenException('ROLE_NOT_ALLOWED', 'Your role cannot perform this action', {
      allowed: [...allowed],
    });
  }
  return { userId: actor.userId, kind };
};

/** Admin holding `permission` (superadmin holds them all through its role). */
export const requireAdminWith = (actor: ActorContext, permission: string): ActorRef => {
  const ref = resolveActor(actor, ['ADMIN']);
  if (!actor.permissions.includes(permission)) {
    throw new ForbiddenException('PERMISSION_REQUIRED', `Missing permission "${permission}"`, {
      permission,
    });
  }
  return ref;
};

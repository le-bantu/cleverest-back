import { ActorContext } from '@shared/application/use-case';
import { AuthenticatedUser } from '@shared/interface/http/decorators/current-user.decorator';

export const actorOf = (user: AuthenticatedUser): ActorContext => ({
  userId: user.userId,
  roles: user.roles,
  permissions: user.permissions,
});

import { PageQuery } from '@shared/kernel';

export interface ActorInfo {
  userId: string;
  roles: string[];
  permissions: string[];
}

/** Free-form profile patch; keys are validated per role by the profile entity. */
export type ProfilePatch = Record<string, unknown>;

export interface CreateUserInput {
  actor: ActorInfo;
  email: string;
  password: string;
  roles: string[];
  phone?: string | null;
  profile?: ProfilePatch;
}
export interface CreateUserOutput {
  userId: string;
}

export interface UpdateUserInput {
  actor: ActorInfo;
  targetUserId: string;
  email?: string;
  password?: string;
  phone?: string | null;
  roles?: string[];
  profile?: ProfilePatch;
}

export interface GetUserInput {
  actor: ActorInfo;
  targetUserId: string;
}

export interface DeleteUserInput {
  actor: ActorInfo;
  targetUserId: string;
}

export interface ListUsersInput extends PageQuery {
  role?: string;
  search?: string;
}

export interface ListAllUsersInput {
  role?: string;
  expertise?: string;
}

export interface UpdateOwnProfileInput {
  userId: string;
  email?: string;
  password?: string;
  phone?: string | null;
  profile?: ProfilePatch;
}

export interface ToggleTwoFactorInput {
  userId: string;
  enabled: boolean;
}

export interface DeactivateOwnAccountInput {
  userId: string;
}

export interface GetCurrentUserInput {
  userId: string;
}

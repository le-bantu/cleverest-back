import { Page, PageQuery } from '@shared/kernel';
import { User } from '../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserListFilter {
  role?: string;
  /** free-text match on email */
  search?: string;
  /** consultant expertise domain contains */
  expertise?: string;
  includeDeleted?: boolean;
}

/**
 * PORT. Persists the User aggregate together with its roles, direct
 * permissions and 1-1 profile.
 */
export abstract class UserRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract existsByEmail(email: string): Promise<boolean>;
  abstract save(user: User): Promise<void>;
  abstract list(query: PageQuery, filter: UserListFilter): Promise<Page<User>>;
  abstract listAll(filter: UserListFilter): Promise<User[]>;
}

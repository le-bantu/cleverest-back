import { ConflictException } from '@shared/kernel';
import { Email, Password, PasswordHasher, User, UserRepository } from '../../domain';
import { ProfilePatch } from '../dto/user.dto';

export interface UserChangeSet {
  email?: string;
  password?: string;
  phone?: string | null;
  profile?: ProfilePatch;
}

/**
 * Applies the common self-service editable fields to a User aggregate.
 * Mutates `user`; caller persists.
 */
export const applyUserChanges = async (
  user: User,
  changes: UserChangeSet,
  deps: { users: UserRepository; hasher: PasswordHasher },
): Promise<void> => {
  if (changes.email !== undefined) {
    const email = Email.create(changes.email);
    if (email.value !== user.emailValue) {
      if (await deps.users.existsByEmail(email.value)) {
        throw new ConflictException('EMAIL_ALREADY_USED', 'This email is already taken');
      }
      user.changeEmail(email);
    }
  }

  if (changes.password !== undefined) {
    const password = Password.create(changes.password);
    user.changePasswordHash(await deps.hasher.hash(password.value));
  }

  if (changes.phone !== undefined) {
    user.setPhone(changes.phone);
  }

  if (changes.profile !== undefined && user.profile) {
    user.profile.update(changes.profile as never);
  }
};

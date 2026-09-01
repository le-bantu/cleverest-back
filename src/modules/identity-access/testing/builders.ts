import { FixedClock } from '@shared/kernel';
import { Email, PermissionName, RoleName, User } from '../domain';
import { FakeHasher } from './fakes';

export const testClock = () => new FixedClock(new Date('2026-01-01T00:00:00.000Z'));

export interface BuildUserOptions {
  id?: string;
  email?: string | null;
  password?: string;
  role?: RoleName;
  roles?: RoleName[];
  directPermissions?: PermissionName[];
  twoFactor?: boolean;
  active?: boolean;
}

let counter = 0;
const uuid = () => {
  counter += 1;
  const n = counter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
};

export const buildUser = async (opts: BuildUserOptions = {}): Promise<User> => {
  const hasher = new FakeHasher();
  const clock = testClock();
  const id = opts.id ?? uuid();
  const passwordHash = await hasher.hash(opts.password ?? 'secret12');
  const user =
    opts.roles && opts.roles.length
      ? User.createByAdmin(
          {
            id,
            email: opts.email === null ? null : Email.create(opts.email ?? `u${counter}@x.com`),
            passwordHash,
            roles: opts.roles,
            directPermissions: opts.directPermissions,
          },
          clock,
        )
      : User.register(
          {
            id,
            email: opts.email === null ? null : Email.create(opts.email ?? `u${counter}@x.com`),
            passwordHash,
            role: opts.role ?? RoleName.CLIENT,
          },
          clock,
        );
  if (opts.directPermissions && !opts.roles) user.setDirectPermissions(opts.directPermissions);
  if (opts.twoFactor) user.setTwoFactor(true);
  if (opts.active === false) user.deactivate();
  user.pullDomainEvents();
  return user;
};

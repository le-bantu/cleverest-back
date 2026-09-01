import {
  AbstractAggregateRoot,
  Clock,
  ConflictException,
  UnauthorizedException,
} from '@shared/kernel';
import { Email } from '../value-objects/email.vo';
import { Role, RoleName } from '../value-objects/role.vo';
import { Permission, PermissionName } from '../value-objects/permission.vo';
import { UserRegistered } from '../events/user-registered.event';
import { TwoFactorToggled } from '../events/two-factor-toggled.event';
import { AnyProfile, emptyProfileForKind } from './any-profile';
import { profileKindForRole } from './profile.entity';

export interface UserProps {
  email: Email | null;
  phone: string | null;
  passwordHash: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  emailVerifiedAt: Date | null;
  roles: Set<RoleName>;
  directPermissions: Set<PermissionName>;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profile: AnyProfile | null;
}

export interface RegisterUserInput {
  id: string;
  email: Email | null;
  passwordHash: string;
  role: RoleName;
  phone?: string | null;
}

export interface CreateUserInput {
  id: string;
  email: Email | null;
  passwordHash: string;
  roles: RoleName[];
  phone?: string | null;
  directPermissions?: PermissionName[];
}

export class User extends AbstractAggregateRoot<string> {
  private props: UserProps;

  private constructor(id: string, props: UserProps) {
    super(id);
    this.props = props;
  }

  // --- factories -----------------------------------------------------------

  static register(input: RegisterUserInput, clock: Clock): User {
    const now = clock.now();
    const role = Role.ensure(input.role);
    const user = new User(input.id, {
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: input.passwordHash,
      isActive: true,
      twoFactorEnabled: false,
      emailVerifiedAt: null,
      roles: new Set<RoleName>([role]),
      directPermissions: new Set<PermissionName>(),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      profile: emptyProfileForKind(input.id, profileKindForRole(role)),
    });
    user.addDomainEvent(
      new UserRegistered(user.id, { email: input.email?.value ?? null, roles: [role] }),
    );
    return user;
  }

  static createByAdmin(input: CreateUserInput, clock: Clock): User {
    if (input.roles.length === 0) {
      throw new ConflictException('USER_WITHOUT_ROLE', 'A user must have at least one role');
    }
    const now = clock.now();
    const roles = new Set<RoleName>(input.roles.map((r) => Role.ensure(r)));
    const primary = [...roles][0];
    const user = new User(input.id, {
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: input.passwordHash,
      isActive: true,
      twoFactorEnabled: false,
      emailVerifiedAt: null,
      roles,
      directPermissions: new Set<PermissionName>(
        (input.directPermissions ?? []).map((p) => Permission.ensure(p)),
      ),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      profile: emptyProfileForKind(input.id, profileKindForRole(primary)),
    });
    user.addDomainEvent(
      new UserRegistered(user.id, { email: input.email?.value ?? null, roles: [...roles] }),
    );
    return user;
  }

  static reconstitute(id: string, props: UserProps): User {
    return new User(id, props);
  }

  // --- behaviour ---------------------------------------------------------

  activate(): void {
    if (this.props.deletedAt) {
      throw new ConflictException('USER_DELETED', 'Cannot activate a deleted account');
    }
    this.props.isActive = true;
    this.touch();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.touch();
  }

  softDelete(clock: Clock): void {
    if (this.props.deletedAt) return;
    this.props.deletedAt = clock.now();
    this.props.isActive = false;
    this.touch();
  }

  changeEmail(email: Email | null): void {
    this.props.email = email;
    this.props.emailVerifiedAt = null;
    this.touch();
  }

  changePasswordHash(hash: string): void {
    if (!hash) throw new ConflictException('EMPTY_PASSWORD_HASH', 'Password hash cannot be empty');
    this.props.passwordHash = hash;
    this.touch();
  }

  setPhone(phone: string | null): void {
    this.props.phone = phone && phone.trim() !== '' ? phone.trim() : null;
    this.touch();
  }

  setTwoFactor(enabled: boolean): void {
    if (this.props.twoFactorEnabled === enabled) return;
    this.props.twoFactorEnabled = enabled;
    this.touch();
    this.addDomainEvent(new TwoFactorToggled(this.id, { enabled }));
  }

  setRoles(roleNames: RoleName[]): void {
    if (roleNames.length === 0) {
      throw new ConflictException('USER_WITHOUT_ROLE', 'A user must keep at least one role');
    }
    this.props.roles = new Set(roleNames.map((r) => Role.ensure(r)));
    this.touch();
  }

  setDirectPermissions(perms: PermissionName[]): void {
    this.props.directPermissions = new Set(perms.map((p) => Permission.ensure(p)));
    this.touch();
  }

  ensureCanAuthenticate(): void {
    if (this.props.deletedAt) {
      throw new UnauthorizedException('ACCOUNT_DELETED', 'This account has been removed');
    }
    if (!this.props.isActive) {
      throw new UnauthorizedException('ACCOUNT_INACTIVE', 'This account is deactivated');
    }
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  // --- getters ---------------------------------------------------------

  get email(): Email | null {
    return this.props.email;
  }
  get emailValue(): string | null {
    return this.props.email?.value ?? null;
  }
  get phone(): string | null {
    return this.props.phone;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get twoFactorEnabled(): boolean {
    return this.props.twoFactorEnabled;
  }
  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt;
  }
  get roles(): RoleName[] {
    return [...this.props.roles];
  }
  get directPermissions(): PermissionName[] {
    return [...this.props.directPermissions];
  }
  get profile(): AnyProfile | null {
    return this.props.profile;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get isAdminLike(): boolean {
    return Role.isAdminLike(this.roles);
  }
}

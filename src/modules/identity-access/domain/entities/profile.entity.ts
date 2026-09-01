import { AbstractEntity } from '@shared/kernel';
import { RoleName } from '../value-objects/role.vo';

export type ProfileKind = 'client' | 'consultant' | 'admin' | 'apporteur';

export const profileKindForRole = (role: RoleName): ProfileKind => {
  switch (role) {
    case RoleName.CLIENT:
      return 'client';
    case RoleName.CONSULTANT:
      return 'consultant';
    case RoleName.APPORTEUR:
      return 'apporteur';
    case RoleName.ADMIN:
    case RoleName.SUPERADMIN:
      return 'admin';
  }
};

export abstract class Profile<Data extends object> extends AbstractEntity<string> {
  abstract readonly kind: ProfileKind;
  protected data: Data;

  protected constructor(userId: string, data: Data) {
    super(userId);
    this.data = data;
  }

  get userId(): string {
    return this._id;
  }

  update(patch: Partial<Data>): void {
    this.data = { ...this.data, ...this.pruneUndefined(patch) };
  }

  toPrimitives(): Data {
    return { ...this.data };
  }

  private pruneUndefined(patch: Partial<Data>): Partial<Data> {
    const out: Partial<Data> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }
}

import { Profile, ProfileKind } from './profile.entity';

export interface AdminProfileData {
  position: string | null;
}

const EMPTY: AdminProfileData = { position: null };

export class AdminProfile extends Profile<AdminProfileData> {
  readonly kind: ProfileKind = 'admin';

  static empty(userId: string): AdminProfile {
    return new AdminProfile(userId, { ...EMPTY });
  }

  static fromPrimitives(userId: string, data: Partial<AdminProfileData>): AdminProfile {
    return new AdminProfile(userId, { ...EMPTY, ...data });
  }
}

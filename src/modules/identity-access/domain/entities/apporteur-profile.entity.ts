import { Profile, ProfileKind } from './profile.entity';

export interface ApporteurProfileData {
  structure: string | null;
  documents: string[];
}

const EMPTY: ApporteurProfileData = { structure: null, documents: [] };

export class ApporteurProfile extends Profile<ApporteurProfileData> {
  readonly kind: ProfileKind = 'apporteur';

  static empty(userId: string): ApporteurProfile {
    return new ApporteurProfile(userId, { ...EMPTY });
  }

  static fromPrimitives(userId: string, data: Partial<ApporteurProfileData>): ApporteurProfile {
    return new ApporteurProfile(userId, { ...EMPTY, ...data });
  }
}

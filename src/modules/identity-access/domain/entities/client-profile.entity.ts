import { Profile, ProfileKind } from './profile.entity';

export interface ClientProfileData {
  name: string | null;
  companySize: string | null;
  taxId: string | null;
  activityType: string | null;
  averageRevenue: number | null;
  companyCreationDate: Date | null;
  rib: string | null;
}

const EMPTY: ClientProfileData = {
  name: null,
  companySize: null,
  taxId: null,
  activityType: null,
  averageRevenue: null,
  companyCreationDate: null,
  rib: null,
};

export class ClientProfile extends Profile<ClientProfileData> {
  readonly kind: ProfileKind = 'client';

  static empty(userId: string): ClientProfile {
    return new ClientProfile(userId, { ...EMPTY });
  }

  static fromPrimitives(userId: string, data: Partial<ClientProfileData>): ClientProfile {
    return new ClientProfile(userId, { ...EMPTY, ...data });
  }
}

import { Profile, ProfileKind } from './profile.entity';

export interface ConsultantProfileData {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  isCompany: boolean;
  taxId: string | null;
  expertiseDomains: string[];
  experience: string | null;
  billingEntity: string | null;
  hasAcceptedConditions: boolean;
  consultingContractUrl: string | null;
  rib: string | null;
  validated: boolean;
}

const EMPTY: ConsultantProfileData = {
  firstName: null,
  lastName: null,
  phone: null,
  email: null,
  isCompany: false,
  taxId: null,
  expertiseDomains: [],
  experience: null,
  billingEntity: null,
  hasAcceptedConditions: false,
  consultingContractUrl: null,
  rib: null,
  validated: false,
};

export class ConsultantProfile extends Profile<ConsultantProfileData> {
  readonly kind: ProfileKind = 'consultant';

  static empty(userId: string): ConsultantProfile {
    return new ConsultantProfile(userId, { ...EMPTY });
  }

  static fromPrimitives(userId: string, data: Partial<ConsultantProfileData>): ConsultantProfile {
    return new ConsultantProfile(userId, { ...EMPTY, ...data });
  }

  markValidated(validated: boolean): void {
    this.data = { ...this.data, validated };
  }
}

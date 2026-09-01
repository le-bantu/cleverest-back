import { ClientProfile } from './client-profile.entity';
import { ConsultantProfile } from './consultant-profile.entity';
import { AdminProfile } from './admin-profile.entity';
import { ApporteurProfile } from './apporteur-profile.entity';
import { ProfileKind } from './profile.entity';

export type AnyProfile = ClientProfile | ConsultantProfile | AdminProfile | ApporteurProfile;

export const emptyProfileForKind = (userId: string, kind: ProfileKind): AnyProfile => {
  switch (kind) {
    case 'client':
      return ClientProfile.empty(userId);
    case 'consultant':
      return ConsultantProfile.empty(userId);
    case 'admin':
      return AdminProfile.empty(userId);
    case 'apporteur':
      return ApporteurProfile.empty(userId);
  }
};

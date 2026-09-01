import { ClientProfile } from './client-profile.entity';
import { ConsultantProfile } from './consultant-profile.entity';
import { AdminProfile } from './admin-profile.entity';
import { ApporteurProfile } from './apporteur-profile.entity';
import { profileKindForRole } from './profile.entity';
import { RoleName } from '../value-objects/role.vo';

describe('profileKindForRole', () => {
  it('maps every role to a profile kind', () => {
    expect(profileKindForRole(RoleName.CLIENT)).toBe('client');
    expect(profileKindForRole(RoleName.CONSULTANT)).toBe('consultant');
    expect(profileKindForRole(RoleName.APPORTEUR)).toBe('apporteur');
    expect(profileKindForRole(RoleName.ADMIN)).toBe('admin');
    expect(profileKindForRole(RoleName.SUPERADMIN)).toBe('admin');
  });
});

describe('profile entities', () => {
  it('ClientProfile: empty, update (prunes undefined), toPrimitives', () => {
    const p = ClientProfile.empty('u1');
    expect(p.kind).toBe('client');
    expect(p.userId).toBe('u1');
    p.update({ name: 'Acme', taxId: undefined });
    expect(p.toPrimitives()).toMatchObject({ name: 'Acme', taxId: null });
  });

  it('ConsultantProfile: fromPrimitives + markValidated', () => {
    const p = ConsultantProfile.fromPrimitives('u2', { expertiseDomains: ['tax'] });
    expect(p.toPrimitives().expertiseDomains).toEqual(['tax']);
    p.markValidated(true);
    expect(p.toPrimitives().validated).toBe(true);
  });

  it('AdminProfile + ApporteurProfile round-trip', () => {
    expect(AdminProfile.fromPrimitives('u3', { position: 'CFO' }).toPrimitives()).toEqual({
      position: 'CFO',
    });
    const ap = ApporteurProfile.empty('u4');
    ap.update({ structure: 'Cabinet X', documents: ['a.pdf'] });
    expect(ap.toPrimitives()).toEqual({ structure: 'Cabinet X', documents: ['a.pdf'] });
  });
});

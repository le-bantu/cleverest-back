import { Role, RoleName } from './role.vo';
import { ValidationException } from '@shared/kernel';

describe('Role', () => {
  it('lists the five known roles', () => {
    expect(Role.ALL).toEqual(['client', 'consultant', 'apporteur', 'admin', 'superadmin']);
  });

  it('ensure() returns valid roles and throws on unknown', () => {
    expect(Role.ensure('admin')).toBe(RoleName.ADMIN);
    expect(() => Role.ensure('root')).toThrow(ValidationException);
  });

  it('only client/consultant/apporteur are self-assignable', () => {
    expect(Role.isSelfAssignable('client')).toBe(true);
    expect(Role.isSelfAssignable('consultant')).toBe(true);
    expect(Role.isSelfAssignable('apporteur')).toBe(true);
    expect(Role.isSelfAssignable('admin')).toBe(false);
    expect(Role.isSelfAssignable('superadmin')).toBe(false);
  });

  it('isAdminLike detects admin or superadmin', () => {
    expect(Role.isAdminLike(['client'])).toBe(false);
    expect(Role.isAdminLike(['client', 'admin'])).toBe(true);
    expect(Role.isAdminLike(['superadmin'])).toBe(true);
  });
});

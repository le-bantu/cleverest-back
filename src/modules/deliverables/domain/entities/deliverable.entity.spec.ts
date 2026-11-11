import { aDeliverable, NOW } from '../../testing/in-memory';
import { Deliverable } from './deliverable.entity';
import {
  DeliverableUploaded,
  DeliverableValidatedByAdmin,
  DeliverableValidatedByClient,
} from '../events/deliverable.events';

const LATER = new Date(NOW.getTime() + 1000);
const mission = (overrides = {}) => ({
  id: 'm1',
  clientId: 'client-1',
  consultantIds: ['c1'],
  status: 'EN_COURS',
  active: true,
  ...overrides,
});
const file = { key: 'k', originalName: 'rapport.zip', mimeType: null, size: 9 };

describe('Deliverable', () => {
  it('is uploaded by an assigned consultant on an active mission, unvalidated', () => {
    const d = Deliverable.upload({ id: 'd1', mission: mission(), consultantId: 'c1', file }, NOW);
    expect(d).toMatchObject({
      missionId: 'm1',
      consultantId: 'c1',
      clientId: 'client-1',
      uploadedAt: NOW,
      clientValidated: false,
      clientValidatedAt: null,
      adminValidated: false,
      adminValidatedAt: null,
      adminValidatedById: null,
    });
    expect(d.file).toEqual(file);
    expect(d.pullDomainEvents()).toEqual([expect.any(DeliverableUploaded)]);
  });

  it('refuses a non-assigned consultant (403), an inactive mission (409), an empty file', () => {
    expect(() =>
      Deliverable.upload({ id: 'd', mission: mission(), consultantId: 'c9', file }, NOW),
    ).toThrow(expect.objectContaining({ code: 'MISSION_NOT_ASSIGNED', httpStatus: 403 }));
    expect(() =>
      Deliverable.upload(
        {
          id: 'd',
          mission: mission({ active: false, status: 'EN_ATTENTE' }),
          consultantId: 'c1',
          file,
        },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'MISSION_NOT_ACTIVE', httpStatus: 409 }));
    expect(() =>
      Deliverable.upload(
        { id: 'd', mission: mission(), consultantId: 'c1', file: { ...file, size: 0 } },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'FILE_EMPTY' }));
  });

  it('is invisible to the client until an admin validates it', () => {
    const d = aDeliverable();
    expect(d.isVisibleToClient('client-1')).toBe(false);
    expect(d.isVisibleTo({ userId: 'client-1', kind: 'CLIENT' })).toBe(false);
    expect(d.isVisibleTo({ userId: 'admin', kind: 'ADMIN' })).toBe(true);
    expect(d.isVisibleTo({ userId: 'c1', kind: 'CONSULTANT' })).toBe(true);
    expect(d.isVisibleTo({ userId: 'c2', kind: 'CONSULTANT' })).toBe(false);

    d.validateByAdmin('admin-1', LATER);
    expect(d).toMatchObject({
      adminValidated: true,
      adminValidatedAt: LATER,
      adminValidatedById: 'admin-1',
    });
    expect(d.isVisibleToClient('client-1')).toBe(true);
    expect(d.isVisibleToClient('client-2')).toBe(false);
    expect(d.pullDomainEvents()).toEqual([expect.any(DeliverableValidatedByAdmin)]);
    d.validateByAdmin('admin-2', NOW); // idempotent
    expect(d.adminValidatedById).toBe('admin-1');
    expect(d.pullDomainEvents()).toEqual([]);
  });

  it('client validation needs a released deliverable of their own (404 otherwise); idempotent', () => {
    const d = aDeliverable();
    expect(() => d.validateByClient('client-1', NOW)).toThrow(
      expect.objectContaining({ code: 'DELIVERABLE_NOT_FOUND' }),
    );
    d.validateByAdmin('admin-1', NOW);
    expect(() => d.validateByClient('client-2', NOW)).toThrow(
      expect.objectContaining({ code: 'DELIVERABLE_NOT_FOUND' }),
    );
    d.pullDomainEvents();
    d.validateByClient('client-1', LATER);
    expect(d).toMatchObject({ clientValidated: true, clientValidatedAt: LATER });
    expect(d.pullDomainEvents()).toEqual([expect.any(DeliverableValidatedByClient)]);
    d.validateByClient('client-1', NOW);
    expect(d.clientValidatedAt).toEqual(LATER);
  });

  it('the two validations are independent (client then admin order is not constrained)', () => {
    const released = aDeliverable({ adminValidated: true, adminValidatedAt: NOW });
    released.validateByClient('client-1', NOW);
    expect(released.clientValidated).toBe(true);
    const fresh = aDeliverable();
    fresh.validateByAdmin('a', NOW);
    expect(fresh.clientValidated).toBe(false);
  });
});

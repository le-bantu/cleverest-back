import { canViewMissionReview, MissionReview } from './mission-review.entity';
import { MissionForReview } from '../ports/review-missions.port';
import { MissionReviewRevised, MissionReviewSubmitted } from '../events/mission-review.events';

const NOW = new Date('2026-09-01T10:00:00.000Z');
const LATER = new Date('2026-09-02T10:00:00.000Z');

const mission = (overrides: Partial<MissionForReview> = {}): MissionForReview => ({
  id: 'mission-1',
  clientId: 'client-1',
  consultantIds: ['c1', 'c2'],
  completed: true,
  ...overrides,
});

const submit = (overrides: Partial<Parameters<typeof MissionReview.submit>[0]> = {}) =>
  MissionReview.submit(
    { id: 'r1', mission: mission(), clientId: 'client-1', rating: 4, ...overrides },
    NOW,
  );

describe('MissionReview', () => {
  it('submit() records the rating and a trimmed comment, and raises an event', () => {
    const review = submit({ comment: '  Très bon travail  ' });
    expect(review).toMatchObject({
      id: 'r1',
      missionId: 'mission-1',
      clientId: 'client-1',
      rating: 4,
      comment: 'Très bon travail',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const [event] = review.pullDomainEvents();
    expect(event).toBeInstanceOf(MissionReviewSubmitted);
    expect(event.payload).toEqual({ missionId: 'mission-1', clientId: 'client-1', rating: 4 });
  });

  it('a blank or missing comment is stored as null', () => {
    expect(submit({ comment: '   ' }).comment).toBeNull();
    expect(submit({ comment: null }).comment).toBeNull();
    expect(submit().comment).toBeNull();
  });

  it.each([0, 6, 3.5, Number.NaN, -1])('refuses the rating %p (422 INVALID_RATING)', (rating) => {
    expect(() => submit({ rating })).toThrow(
      expect.objectContaining({ code: 'INVALID_RATING', httpStatus: 422 }),
    );
  });

  it('accepts the bounds 1 and 5', () => {
    expect(submit({ rating: 1 }).rating).toBe(1);
    expect(submit({ rating: 5 }).rating).toBe(5);
  });

  it('refuses a comment over 2000 characters', () => {
    expect(submit({ comment: 'x'.repeat(2000) }).comment).toHaveLength(2000);
    expect(() => submit({ comment: 'x'.repeat(2001) })).toThrow(
      expect.objectContaining({ code: 'REVIEW_COMMENT_TOO_LONG', httpStatus: 422 }),
    );
  });

  it('refuses a mission that is not completed (422 MISSION_NOT_COMPLETED)', () => {
    expect(() => submit({ mission: mission({ completed: false }) })).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_COMPLETED', httpStatus: 422 }),
    );
  });

  it("hides another client's mission (404 MISSION_NOT_FOUND)", () => {
    expect(() => submit({ clientId: 'client-2' })).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_FOUND', httpStatus: 404 }),
    );
  });

  it('revise() replaces rating and comment, keeps createdAt, raises an event', () => {
    const review = submit({ comment: 'ok' });
    review.pullDomainEvents();
    review.revise({ mission: mission(), clientId: 'client-1', rating: 2 }, LATER);
    expect(review).toMatchObject({ rating: 2, comment: null, createdAt: NOW, updatedAt: LATER });
    const [event] = review.pullDomainEvents();
    expect(event).toBeInstanceOf(MissionReviewRevised);
    expect(event.payload).toMatchObject({ rating: 2, previousRating: 4 });
  });

  it('revise() applies the same rules and only to its own (mission, client)', () => {
    const review = submit();
    expect(() =>
      review.revise({ mission: mission(), clientId: 'client-1', rating: 9 }, LATER),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RATING' }));
    expect(() =>
      review.revise(
        { mission: mission({ completed: false }), clientId: 'client-1', rating: 3 },
        LATER,
      ),
    ).toThrow(expect.objectContaining({ code: 'MISSION_NOT_COMPLETED' }));
    expect(() =>
      review.revise({ mission: mission({ id: 'other' }), clientId: 'client-1', rating: 3 }, LATER),
    ).toThrow(expect.objectContaining({ code: 'MISSION_NOT_FOUND' }));
    expect(() =>
      review.revise({ mission: mission(), clientId: 'client-2', rating: 3 }, LATER),
    ).toThrow(expect.objectContaining({ code: 'MISSION_NOT_FOUND' }));
    expect(review.rating).toBe(4);
  });

  it('canViewMissionReview: admin, the mission client, its consultants only', () => {
    const m = mission();
    expect(canViewMissionReview({ userId: 'a', kind: 'ADMIN' }, m)).toBe(true);
    expect(canViewMissionReview({ userId: 'client-1', kind: 'CLIENT' }, m)).toBe(true);
    expect(canViewMissionReview({ userId: 'client-2', kind: 'CLIENT' }, m)).toBe(false);
    expect(canViewMissionReview({ userId: 'c2', kind: 'CONSULTANT' }, m)).toBe(true);
    expect(canViewMissionReview({ userId: 'c9', kind: 'CONSULTANT' }, m)).toBe(false);
    expect(canViewMissionReview({ userId: 'client-1', kind: 'APPORTEUR' }, m)).toBe(false);
  });
});

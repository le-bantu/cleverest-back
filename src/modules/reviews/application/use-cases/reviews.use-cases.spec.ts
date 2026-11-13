import { FixedClock } from '@shared/kernel';
import { actors } from '@shared/testing/fakes';
import { aMissionReview, NOW, reviewsTestContext } from '../../testing/in-memory';
import {
  GetMissionReviewDetailsUseCase,
  GetMissionReviewUseCase,
  ListMissionReviewsUseCase,
  SubmitMissionReviewUseCase,
} from './reviews.use-cases';

const LATER = new Date('2026-09-05T10:00:00.000Z');

describe('SubmitMissionReviewUseCase', () => {
  const setup = () => {
    const ctx = reviewsTestContext();
    const uc = new SubmitMissionReviewUseCase(ctx.reviews, ctx.missions, ctx.committer, ctx.clock);
    const mission = ctx.missions.add();
    return { ctx, uc, mission };
  };

  it('creates the review, then a second submission updates it (no duplicate)', async () => {
    const { ctx, uc, mission } = setup();
    const first = await uc.execute({
      actor: actors.client('client-1'),
      missionId: mission.id,
      rating: 5,
      comment: 'Parfait',
    });
    expect(first.created).toBe(true);
    expect(first.review).toMatchObject({
      missionId: mission.id,
      clientId: 'client-1',
      rating: 5,
      comment: 'Parfait',
      createdAt: NOW,
    });

    const later = new SubmitMissionReviewUseCase(
      ctx.reviews,
      ctx.missions,
      ctx.committer,
      new FixedClock(LATER),
    );
    const second = await later.execute({
      actor: actors.client('client-1'),
      missionId: mission.id,
      rating: 3,
    });
    expect(second.created).toBe(false);
    expect(second.review).toMatchObject({
      id: first.review.id,
      rating: 3,
      comment: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(ctx.reviews.store.size).toBe(1);
    expect(ctx.audit.entries.map((e) => [e.action, e.metadata])).toEqual([
      ['CREATED', { missionId: mission.id, rating: 5 }],
      ['UPDATED', { missionId: mission.id, rating: 3, previousRating: 5 }],
    ]);
    expect(ctx.bus.names()).toEqual(['reviews.submitted', 'reviews.revised']);
  });

  it('returns the stored row when a concurrent submission created it first', async () => {
    const { ctx, uc, mission } = setup();
    const winner = aMissionReview({ missionId: mission.id, rating: 1 });
    // the race: our lookup misses, but the row exists by the time we save
    const lookup = jest.spyOn(ctx.reviews, 'findByMissionAndClient').mockResolvedValueOnce(null);
    await ctx.reviews.save(winner);
    const out = await uc.execute({
      actor: actors.client('client-1'),
      missionId: mission.id,
      rating: 4,
    });
    lookup.mockRestore();
    expect(out.review).toMatchObject({ id: winner.id, rating: 4 });
    expect(ctx.reviews.store.size).toBe(1);
  });

  it('refuses a mission that is not TERMINÉE and writes nothing', async () => {
    const { ctx, uc } = setup();
    const ongoing = ctx.missions.add({ completed: false });
    await expect(
      uc.execute({ actor: actors.client('client-1'), missionId: ongoing.id, rating: 4 }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_COMPLETED', httpStatus: 422 });
    expect(ctx.reviews.store.size).toBe(0);
    expect(ctx.audit.entries).toHaveLength(0);
  });

  it('refuses an out-of-range rating', async () => {
    const { uc, mission } = setup();
    await expect(
      uc.execute({ actor: actors.client('client-1'), missionId: mission.id, rating: 6 }),
    ).rejects.toMatchObject({ code: 'INVALID_RATING', httpStatus: 422 });
  });

  it("404 for an unknown mission or another client's mission", async () => {
    const { uc, mission } = setup();
    await expect(
      uc.execute({ actor: actors.client('client-1'), missionId: 'nope', rating: 4 }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND', httpStatus: 404 });
    await expect(
      uc.execute({ actor: actors.client('client-2'), missionId: mission.id, rating: 4 }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND', httpStatus: 404 });
  });

  it('only clients review', async () => {
    const { uc, mission } = setup();
    for (const actor of [actors.consultant('c1'), actors.superadmin(), actors.apporteur()]) {
      await expect(uc.execute({ actor, missionId: mission.id, rating: 4 })).rejects.toMatchObject({
        code: 'ROLE_NOT_ALLOWED',
        httpStatus: 403,
      });
    }
  });
});

describe('GetMissionReviewUseCase', () => {
  const setup = () => {
    const ctx = reviewsTestContext();
    const uc = new GetMissionReviewUseCase(ctx.reviews, ctx.missions);
    const mission = ctx.missions.add({ consultantIds: ['c1'] });
    return { ctx, uc, mission };
  };

  it('the client, a consultant of the mission and an admin see the review', async () => {
    const { ctx, uc, mission } = setup();
    const review = aMissionReview({ missionId: mission.id });
    await ctx.reviews.save(review);
    for (const actor of [actors.client('client-1'), actors.consultant('c1'), actors.admin()]) {
      expect(await uc.execute({ actor, missionId: mission.id })).toMatchObject({
        id: review.id,
        rating: 4,
      });
    }
  });

  it('anyone else gets MISSION_NOT_FOUND; no review yet = MISSION_REVIEW_NOT_FOUND', async () => {
    const { ctx, uc, mission } = setup();
    for (const actor of [actors.client('client-2'), actors.consultant('c9')]) {
      await expect(uc.execute({ actor, missionId: mission.id })).rejects.toMatchObject({
        code: 'MISSION_NOT_FOUND',
      });
    }
    await expect(uc.execute({ actor: actors.admin(), missionId: 'unknown' })).rejects.toMatchObject(
      { code: 'MISSION_NOT_FOUND' },
    );
    await expect(
      uc.execute({ actor: actors.client('client-1'), missionId: mission.id }),
    ).rejects.toMatchObject({ code: 'MISSION_REVIEW_NOT_FOUND', httpStatus: 404 });
    await expect(
      uc.execute({ actor: actors.apporteur(), missionId: mission.id }),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
    expect(ctx.reviews.store.size).toBe(0);
  });
});

describe('admin review queries', () => {
  const setup = async () => {
    const ctx = reviewsTestContext();
    const reviews = [
      aMissionReview({ missionId: 'm1', clientId: 'cl1', rating: 5 }),
      aMissionReview({ missionId: 'm2', clientId: 'cl1', rating: 2 }),
      aMissionReview({ missionId: 'm3', clientId: 'cl2', rating: 4 }),
    ];
    for (const r of reviews) await ctx.reviews.save(r);
    return {
      list: new ListMissionReviewsUseCase(ctx.queries),
      get: new GetMissionReviewDetailsUseCase(ctx.queries),
      reviews,
    };
  };

  it('lists with filters and pagination', async () => {
    const { list } = await setup();
    const ratings = async (f: object) =>
      (await list.execute({ actor: actors.admin(), ...f })).data.map((d) => d.rating).sort();
    expect(await ratings({})).toEqual([2, 4, 5]);
    expect(await ratings({ clientId: 'cl1' })).toEqual([2, 5]);
    expect(await ratings({ missionId: 'm3' })).toEqual([4]);
    expect(await ratings({ minRating: 4 })).toEqual([4, 5]);
    expect(await ratings({ maxRating: 4, minRating: 3 })).toEqual([4]);
    const page = await list.execute({ actor: actors.admin(), page: 2, perPage: 2 });
    expect(page.meta).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
  });

  it('one review with its mission and client; 404 when unknown', async () => {
    const { get, reviews } = await setup();
    expect(await get.execute({ actor: actors.admin(), reviewId: reviews[0].id })).toMatchObject({
      id: reviews[0].id,
      mission: { id: 'm1' },
      client: { id: 'cl1' },
    });
    await expect(get.execute({ actor: actors.admin(), reviewId: 'nope' })).rejects.toMatchObject({
      code: 'MISSION_REVIEW_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('admins only', async () => {
    const { list, get, reviews } = await setup();
    await expect(list.execute({ actor: actors.client('cl1') })).rejects.toMatchObject({
      code: 'ROLE_NOT_ALLOWED',
    });
    await expect(
      get.execute({ actor: actors.consultant(), reviewId: reviews[0].id }),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });
});

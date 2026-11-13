import { FixedClock, generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { FakeAuditLog, FakeEventBus } from '@shared/testing/fakes';
import {
  MissionForReview,
  MissionReview,
  MissionReviewProps,
  MissionReviewRepository,
  ReviewMissionGatewayPort,
} from '../domain';
import {
  MissionReviewDetails,
  MissionReviewListFilter,
  MissionReviewQueriesPort,
} from '../application/ports/mission-review-queries.port';
import { MissionReviewCommitter } from '../application/review-services';

export const NOW = new Date('2026-09-01T10:00:00.000Z');

/** Keyed like the unique (missionId, clientId) index: save() is an upsert on that pair. */
export class InMemoryMissionReviewRepository extends MissionReviewRepository {
  readonly store = new Map<string, MissionReview>();

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<MissionReview | null> {
    return Promise.resolve([...this.store.values()].find((r) => r.id === id) ?? null);
  }
  findByMissionAndClient(missionId: string, clientId: string): Promise<MissionReview | null> {
    return Promise.resolve(this.store.get(`${missionId}:${clientId}`) ?? null);
  }
  save(review: MissionReview): Promise<void> {
    const key = `${review.missionId}:${review.clientId}`;
    const stored = this.store.get(key);
    this.store.set(
      key,
      MissionReview.rehydrate({
        id: stored?.id ?? review.id,
        missionId: review.missionId,
        clientId: review.clientId,
        rating: review.rating,
        comment: review.comment,
        createdAt: stored?.createdAt ?? review.createdAt,
        updatedAt: review.updatedAt,
      }),
    );
    return Promise.resolve();
  }
}

export class FakeReviewMissionGateway extends ReviewMissionGatewayPort {
  readonly missions = new Map<string, MissionForReview>();
  add(overrides: Partial<MissionForReview> = {}): MissionForReview {
    const m: MissionForReview = {
      id: generateUuid(),
      clientId: 'client-1',
      consultantIds: ['c1'],
      completed: true,
      ...overrides,
    };
    this.missions.set(m.id, m);
    return m;
  }
  findMission(missionId: string): Promise<MissionForReview | null> {
    return Promise.resolve(this.missions.get(missionId) ?? null);
  }
}

/** Projects the in-memory reviews (mission title = `Mission <id>`). */
export class InMemoryMissionReviewQueries extends MissionReviewQueriesPort {
  constructor(private readonly reviews: InMemoryMissionReviewRepository) {
    super();
  }
  private details(r: MissionReview): MissionReviewDetails {
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      mission: { id: r.missionId, title: `Mission ${r.missionId}`, status: 'TERMINÉE' },
      client: { id: r.clientId, name: null, email: null },
    };
  }
  async findById(id: string): Promise<MissionReviewDetails | null> {
    const r = await this.reviews.findById(id);
    return r ? this.details(r) : null;
  }
  list(query: PageQuery, f: MissionReviewListFilter): Promise<Page<MissionReviewDetails>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.reviews.store.values()].filter(
      (r) =>
        (f.missionId === undefined || r.missionId === f.missionId) &&
        (f.clientId === undefined || r.clientId === f.clientId) &&
        (f.minRating === undefined || r.rating >= f.minRating) &&
        (f.maxRating === undefined || r.rating <= f.maxRating),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(
        items.slice(start, start + perPage).map((r) => this.details(r)),
        items.length,
        { page, perPage },
      ),
    );
  }
}

export const reviewsTestContext = () => {
  const reviews = new InMemoryMissionReviewRepository();
  const queries = new InMemoryMissionReviewQueries(reviews);
  const missions = new FakeReviewMissionGateway();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const clock = new FixedClock(NOW);
  const committer = new MissionReviewCommitter(reviews, audit, bus);
  return { reviews, queries, missions, audit, bus, clock, committer };
};

export const aMissionReview = (overrides: Partial<MissionReviewProps> = {}): MissionReview =>
  MissionReview.rehydrate({
    id: generateUuid(),
    missionId: 'mission-1',
    clientId: 'client-1',
    rating: 4,
    comment: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

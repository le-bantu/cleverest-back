import { Page, normalizePageQuery, pageToSkipTake, MAX_PER_PAGE } from './paginated';

describe('Page', () => {
  it('computes meta', () => {
    const page = new Page([1, 2, 3], 10, { page: 1, perPage: 3 });
    expect(page.meta).toEqual({ page: 1, perPage: 3, total: 10, totalPages: 4 });
  });

  it('map keeps meta and transforms data', () => {
    const page = new Page([1, 2], 2, { page: 1, perPage: 2 }).map((n) => n * 10);
    expect(page.data).toEqual([10, 20]);
    expect(page.meta.total).toBe(2);
  });
});

describe('normalizePageQuery', () => {
  it('applies defaults', () => {
    expect(normalizePageQuery(undefined)).toEqual({ page: 1, perPage: 20, sort: undefined });
  });

  it('clamps page to >= 1 and perPage to [1, MAX]', () => {
    expect(normalizePageQuery({ page: 0, perPage: 0 })).toMatchObject({ page: 1, perPage: 20 });
    expect(normalizePageQuery({ page: -5, perPage: 9999 })).toMatchObject({
      page: 1,
      perPage: MAX_PER_PAGE,
    });
  });

  it('keeps sort', () => {
    expect(normalizePageQuery({ sort: 'createdAt:desc' }).sort).toBe('createdAt:desc');
  });
});

describe('pageToSkipTake', () => {
  it('translates page/perPage to skip/take', () => {
    expect(pageToSkipTake({ page: 3, perPage: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

export interface PageQuery {
  page: number; // 1-based
  perPage: number;
  sort?: string; // e.g. "createdAt:desc"
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export class Page<T> {
  readonly data: T[];
  readonly meta: PageMeta;

  constructor(data: T[], total: number, query: Pick<PageQuery, 'page' | 'perPage'>) {
    this.data = data;
    this.meta = {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: query.perPage > 0 ? Math.ceil(total / query.perPage) : 0,
    };
  }

  map<U>(fn: (item: T) => U): Page<U> {
    return new Page<U>(this.data.map(fn), this.meta.total, {
      page: this.meta.page,
      perPage: this.meta.perPage,
    });
  }
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

export const normalizePageQuery = (raw: Partial<PageQuery> | undefined): PageQuery => {
  const page = Math.max(1, Math.trunc(raw?.page ?? DEFAULT_PAGE) || DEFAULT_PAGE);
  const perPageRaw = Math.trunc(raw?.perPage ?? DEFAULT_PER_PAGE) || DEFAULT_PER_PAGE;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, perPageRaw));
  return { page, perPage, sort: raw?.sort };
};

export const pageToSkipTake = (query: PageQuery): { skip: number; take: number } => ({
  skip: (query.page - 1) * query.perPage,
  take: query.perPage,
});

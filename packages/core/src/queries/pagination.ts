/**
 * Framework-neutral cursor helpers for Horizon collection pages.
 *
 * Every paginated fetcher over-fetches by one record: if Horizon returns
 * `limit + 1` records, another page exists. The naive `records.length >=
 * limit` test reports `hasNext: true` whenever the total is an exact multiple
 * of the page size, stranding the caller on an empty final page.
 */

export interface HorizonPage<T> {
  records: T[]
  next: () => Promise<HorizonPage<T>>
  prev: () => Promise<HorizonPage<T>>
}

export interface PageResult<T> {
  records: T[]
  nextCursor: (() => Promise<HorizonPage<unknown>>) | null
  prevCursor: (() => Promise<HorizonPage<unknown>>) | null
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Slices an over-fetched Horizon page (requested at `limit + 1`) down to
 * `limit` records and derives `hasNext`/`hasPrev` from the actual record
 * count rather than a naive `>= limit` comparison.
 */
export function splitOverfetchedPage<T>(
  records: T[],
  limit: number,
  hadCursor: boolean
): { records: T[]; hasNext: boolean; hasPrev: boolean } {
  const hasNext = records.length > limit
  return {
    records: hasNext ? records.slice(0, limit) : records,
    hasNext,
    hasPrev: hadCursor,
  }
}

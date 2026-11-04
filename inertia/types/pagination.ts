/*
 * The `metadata` of a paginated prop, from Lucid's `paginator.getMeta()`.
 */
export type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
}

export type Paginated<T> = {
  data: T[]
  metadata: PaginationMeta
}

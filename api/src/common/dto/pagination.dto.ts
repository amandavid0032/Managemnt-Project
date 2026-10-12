import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be >= 1' })
  page: number = 1;

  /**
   * Hard-capped at MAX_PAGE_SIZE. Without a cap a client can request the whole
   * table in one query, which is a trivial denial-of-service vector.
   */
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be >= 1' })
  @Max(MAX_PAGE_SIZE, { message: `limit must be <= ${MAX_PAGE_SIZE}` })
  limit: number = DEFAULT_PAGE_SIZE;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Marker class. The response interceptor recognises it and emits the
 * `{ success, count, data, meta }` envelope the existing frontend expects.
 */
export class PaginatedResult<T> {
  constructor(
    public readonly data: T[],
    public readonly meta: { pagination: PaginationMeta },
  ) {}

  static from<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return new PaginatedResult(data, {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  }
}

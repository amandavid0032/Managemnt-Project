import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export const GRANULARITIES = ['day', 'week', 'month', 'year'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export class RegistrationsQueryDto {
  @IsOptional()
  @IsIn(GRANULARITIES, { message: `granularity must be one of: ${GRANULARITIES.join(', ')}` })
  granularity: Granularity = 'day';

  /** Inclusive, ISO-8601. Defaults depend on granularity. */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be an ISO-8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be an ISO-8601 date' })
  to?: string;
}

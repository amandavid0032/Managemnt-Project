import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginatedResult } from '../dto/pagination.dto';

export interface ApiResponse<T> {
  success: true;
  count?: number;
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Preserves the legacy `{ success, count, data }` envelope so the existing
 * React frontend keeps working, and extends it with `meta.pagination`.
 * `count` is the number of items in THIS page — the same meaning the old
 * Express API gave it.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<unknown>> {
    return next.handle().pipe(
      map((payload): ApiResponse<unknown> => {
        if (payload instanceof PaginatedResult) {
          return {
            success: true,
            count: payload.data.length,
            data: payload.data,
            meta: payload.meta,
          };
        }
        if (Array.isArray(payload)) {
          return { success: true, count: payload.length, data: payload };
        }
        return { success: true, data: payload };
      }),
    );
  }
}

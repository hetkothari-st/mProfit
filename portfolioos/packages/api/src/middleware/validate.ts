import type { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

type Source = 'body' | 'query' | 'params';

export function validate<T extends ZodSchema>(schema: T, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  search: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

export function asyncHandler<T extends (...args: never[]) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(
      (fn as unknown as (req: Request, res: Response, next: NextFunction) => Promise<unknown>)(
        req,
        res,
        next,
      ),
    ).catch(next);
  };
}

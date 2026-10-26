import { z } from 'zod';

/**
 * `.partial()` for PATCH bodies, without the create schema's defaults.
 *
 * zod 4 applies a field's `.default()` even inside `.partial()` (zod 3 did
 * not), so `createSchema.partial().parse({ name: 'x' })` fills every defaulted
 * field it wasn't given — a rename would silently reset currency to 'INR' or a
 * mailbox's port to 993. This strips top-level defaults first, so a missing
 * key stays missing and the stored value is kept.
 */
export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>): ReturnType<z.ZodObject<T>['partial']> {
  const overrides: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    if (field instanceof z.ZodDefault || field instanceof z.ZodPrefault) {
      overrides[key] = (field.unwrap() as z.ZodType).optional();
    }
  }
  return schema.extend(overrides).partial() as unknown as ReturnType<z.ZodObject<T>['partial']>;
}

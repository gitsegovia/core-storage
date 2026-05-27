import { z } from 'zod';

export const createSystemSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(64, 'Name must be at most 64 characters'),
  slug: z
    .string()
    .min(2)
    .max(32)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with optional hyphens (e.g. "my-erp")',
    ),
});

export const updateSystemSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  isActive: z.boolean().optional(),
});

export type CreateSystemInput = z.infer<typeof createSystemSchema>;
export type UpdateSystemInput = z.infer<typeof updateSystemSchema>;

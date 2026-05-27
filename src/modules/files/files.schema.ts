import { z } from 'zod';

export const fileListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  collection: z.string().optional(),
  mime_type: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type FileListQuery = z.infer<typeof fileListQuerySchema>;

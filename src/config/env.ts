import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4400),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  DATABASE_URL: z.string(),
  STORAGE_PATH: z.string().default('/data/storage'),
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters'),
  SIGNED_URL_SECRET: z.string().min(16, 'SIGNED_URL_SECRET must be at least 16 characters'),
  SIGNED_URL_EXPIRY: z.coerce.number().default(3600),
  MAX_FILE_SIZE: z.coerce.number().default(104857600), // 100MB
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

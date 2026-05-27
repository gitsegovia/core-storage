import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

const KEY_PREFIX = 'csk_';

/** Generate a new API key with a prefix and random string */
export function generateApiKey(slug: string): string {
  return `${KEY_PREFIX}${slug}_${nanoid(32)}`;
}

/** Hash an API key for safe storage in DB */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

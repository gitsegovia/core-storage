import { createHmac } from 'crypto';
import { env } from '../../config/env';

interface SignedUrlPayload {
  fileId: string;
  systemId: number;
  expiresAt: number; // Unix timestamp
}

/** Generate a signed token for a file */
export function generateSignedToken(fileId: string, systemId: number): {
  token: string;
  expiresAt: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + env.SIGNED_URL_EXPIRY;

  const payload = `${fileId}:${systemId}:${expiresAt}`;
  const signature = createHmac('sha256', env.SIGNED_URL_SECRET)
    .update(payload)
    .digest('hex');

  // Token = base64(payload):signature
  const token = Buffer.from(payload).toString('base64url') + '.' + signature;

  return { token, expiresAt };
}

/** Verify and decode a signed token */
export function verifySignedToken(token: string): SignedUrlPayload | null {
  try {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) return null;

    const payload = Buffer.from(encodedPayload, 'base64url').toString();
    const [fileId, systemIdStr, expiresAtStr] = payload.split(':');

    if (!fileId || !systemIdStr || !expiresAtStr) return null;

    const expiresAt = parseInt(expiresAtStr, 10);
    const systemId = parseInt(systemIdStr, 10);

    // Check expiration
    if (Math.floor(Date.now() / 1000) > expiresAt) return null;

    // Verify signature
    const expectedSignature = createHmac('sha256', env.SIGNED_URL_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) return null;

    return { fileId, systemId, expiresAt };
  } catch {
    return null;
  }
}

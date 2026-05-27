import { FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { hashApiKey } from './auth.service';
import { env } from '../../config/env';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors';

const prisma = new PrismaClient();

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/** Middleware: validates system API key */
export async function authenticateSystem(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new UnauthorizedError('Missing or invalid Authorization header. Use: Bearer <api_key>');
  }

  const hashed = hashApiKey(token);
  const system = await prisma.system.findUnique({ where: { apiKey: hashed } });

  if (!system) {
    throw new UnauthorizedError('Invalid API key');
  }

  if (!system.isActive) {
    throw new ForbiddenError('System access has been revoked');
  }

  request.system = system;
}

/** Middleware: validates admin master key */
export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request);
  if (!token || token !== env.ADMIN_API_KEY) {
    throw new UnauthorizedError('Invalid admin key');
  }
}

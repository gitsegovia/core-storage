import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticateSystem } from '../auth/auth.middleware';
import { generateSignedToken, verifySignedToken } from './signed-urls.service';
import { NotFoundError, UnauthorizedError } from '../../shared/errors';
import { getAbsolutePath, fileExists, createFileStream } from '../files/storage.service';

const prisma = new PrismaClient();

export async function signedUrlsRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/signed-url/:fileId
   * Generate a signed URL for a file. Requires system auth.
   */
  app.post<{ Params: { fileId: string } }>(
    '/signed-url/:fileId',
    { onRequest: authenticateSystem },
    async (request) => {
      const file = await prisma.file.findFirst({
        where: {
          id: request.params.fileId,
          systemId: request.system!.id,
        },
      });

      if (!file) throw new NotFoundError('File');

      const { token, expiresAt } = generateSignedToken(file.id, request.system!.id);

      const baseUrl = `${request.protocol}://${request.hostname}`;
      const url = `${baseUrl}/api/v1/public/download?token=${token}`;

      return {
        url,
        token,
        expiresAt,
        expiresIn: `${Math.round((expiresAt - Date.now() / 1000))} seconds`,
      };
    },
  );

  /**
   * GET /api/v1/public/download?token=xxx
   * Download a file using a signed URL. No auth required.
   */
  app.get<{ Querystring: { token: string } }>(
    '/public/download',
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        throw new UnauthorizedError('Missing token parameter');
      }

      const payload = verifySignedToken(token);
      if (!payload) {
        throw new UnauthorizedError('Invalid or expired token');
      }

      const file = await prisma.file.findFirst({
        where: {
          id: payload.fileId,
          systemId: payload.systemId,
        },
      });

      if (!file) throw new NotFoundError('File');

      const absolutePath = getAbsolutePath(file.fullPath);
      if (!(await fileExists(absolutePath))) {
        throw new NotFoundError('File on disk');
      }

      reply.header('Content-Type', file.mimeType);
      reply.header('Content-Disposition', `inline; filename="${file.originalName}"`);
      reply.header('Content-Length', Number(file.size));

      return reply.send(createFileStream(absolutePath));
    },
  );
}

import { FastifyInstance } from 'fastify';
import { authenticateSystem } from '../auth/auth.middleware';
import { fileListQuerySchema } from './files.schema';
import * as filesService from './files.service';
import { env } from '../../config/env';
import { BadRequestError } from '../../shared/errors';

export async function filesRoutes(app: FastifyInstance) {
  // All routes require system auth
  app.addHook('onRequest', authenticateSystem);

  /**
   * POST /api/v1/upload/:collection
   * Collection supports nested paths: "invoices" or "invoices/clients/acme"
   */
  app.post<{ Params: { '*': string } }>('/upload/*', async (request, reply) => {
    const collectionPath = request.params['*'];

    if (!collectionPath) {
      throw new BadRequestError('Collection path is required. Example: /upload/invoices');
    }

    const data = await request.file();
    if (!data) {
      throw new BadRequestError('No file provided');
    }

    if (data.file.bytesRead > env.MAX_FILE_SIZE) {
      throw new BadRequestError(`File exceeds maximum size of ${env.MAX_FILE_SIZE} bytes`);
    }

    const result = await filesService.uploadFile({
      system: request.system!,
      collectionPath,
      fileName: data.filename,
      mimeType: data.mimetype,
      fileStream: data.file,
    });

    return reply.status(201).send(result);
  });

  // GET /api/v1/files — List files with filters
  app.get('/', async (request) => {
    const query = fileListQuerySchema.parse(request.query);
    return filesService.listFiles(request.system!.id, query);
  });

  // GET /api/v1/files/:fileId — Download file
  app.get<{ Params: { fileId: string } }>('/:fileId', async (request, reply) => {
    const { stream, mimeType, originalName, size } = await filesService.downloadFile(
      request.params.fileId,
      request.system!.id,
    );

    reply.header('Content-Type', mimeType);
    reply.header('Content-Disposition', `attachment; filename="${originalName}"`);
    reply.header('Content-Length', size);

    return reply.send(stream);
  });

  // GET /api/v1/files/:fileId/info — File metadata
  app.get<{ Params: { fileId: string } }>('/:fileId/info', async (request) => {
    return filesService.getFileInfo(request.params.fileId, request.system!.id);
  });

  // DELETE /api/v1/files/:fileId — Delete file
  app.delete<{ Params: { fileId: string } }>('/:fileId', async (request) => {
    return filesService.deleteFileRecord(request.params.fileId, request.system!.id);
  });

  // GET /api/v1/collections — List collections for this system
  app.get('/collections/list', async (request) => {
    return filesService.listCollections(request.system!.id);
  });
}

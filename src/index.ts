import Fastify, { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { loggerConfig } from './shared/logger';
import { AppError } from './shared/errors';
import { ZodError } from 'zod';

// Route modules
import { systemsRoutes } from './modules/systems/systems.routes';
import { filesRoutes } from './modules/files/files.routes';
import { signedUrlsRoutes } from './modules/signed-urls/signed-urls.routes';

async function bootstrap() {
  const app = Fastify({ logger: loggerConfig });

  // ── Plugins ──
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_FILE_SIZE,
    },
  });

  // ── Global error handler ──
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Invalid request data',
        details: error.flatten(),
        statusCode: 400,
      });
    }

    // Fastify built-in errors (payload too large, etc.)
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode: 500,
    });
  });

  // ── Health check ──
  app.get('/health', async () => ({
    status: 'ok',
    service: 'core-storage',
    timestamp: new Date().toISOString(),
  }));

  // ── Routes ──
  app.register(systemsRoutes, { prefix: '/api/v1/admin/systems' });
  app.register(filesRoutes, { prefix: '/api/v1' });
  app.register(signedUrlsRoutes, { prefix: '/api/v1' });

  // ── Start ──
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🗄️  Core Storage running on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();

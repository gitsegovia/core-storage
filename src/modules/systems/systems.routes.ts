import { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../auth/auth.middleware';
import { createSystemSchema, updateSystemSchema } from './systems.schema';
import * as systemsService from './systems.service';

export async function systemsRoutes(app: FastifyInstance) {
  // All routes require admin auth
  app.addHook('onRequest', authenticateAdmin);

  // POST /api/v1/admin/systems — Register a new system
  app.post('/', async (request, reply) => {
    const body = createSystemSchema.parse(request.body);
    const result = await systemsService.createSystem(body);
    return reply.status(201).send(result);
  });

  // GET /api/v1/admin/systems — List all systems
  app.get('/', async () => {
    return systemsService.listSystems();
  });

  // GET /api/v1/admin/systems/:id — Get system details
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    return systemsService.getSystem(Number(request.params.id));
  });

  // PATCH /api/v1/admin/systems/:id — Update system
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateSystemSchema.parse(request.body);
    return systemsService.updateSystem(Number(request.params.id), body);
  });

  // POST /api/v1/admin/systems/:id/regenerate-key — Regenerate API key
  app.post<{ Params: { id: string } }>('/:id/regenerate-key', async (request) => {
    return systemsService.regenerateApiKey(Number(request.params.id));
  });
}

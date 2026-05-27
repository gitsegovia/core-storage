import type { System } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated system making the request */
    system?: System;
  }
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface FileListQuery extends PaginationQuery {
  collection?: string;
  mime_type?: string;
  from?: string;
  to?: string;
}

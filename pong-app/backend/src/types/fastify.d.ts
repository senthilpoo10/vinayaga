// pong-app/backend/src/types/fastify.d.ts
// Custom Fastify types
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export interface RequestWithUser extends FastifyRequest {
  user?: {
    id: string;
    email: string;
  };
}


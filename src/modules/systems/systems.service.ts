import { PrismaClient } from '@prisma/client';
import { generateApiKey, hashApiKey } from '../auth/auth.service';
import { CreateSystemInput, UpdateSystemInput } from './systems.schema';
import { BadRequestError, NotFoundError } from '../../shared/errors';

const prisma = new PrismaClient();

export async function createSystem(input: CreateSystemInput) {
  const existing = await prisma.system.findFirst({
    where: { OR: [{ name: input.name }, { slug: input.slug }] },
  });

  if (existing) {
    throw new BadRequestError(
      `A system with this ${existing.name === input.name ? 'name' : 'slug'} already exists`,
    );
  }

  const plainKey = generateApiKey(input.slug);
  const hashedKey = hashApiKey(plainKey);

  const system = await prisma.system.create({
    data: {
      name: input.name,
      slug: input.slug,
      apiKey: hashedKey,
    },
  });

  // Return plain key only on creation — it won't be recoverable later
  return {
    id: system.id,
    name: system.name,
    slug: system.slug,
    apiKey: plainKey,
    isActive: system.isActive,
    createdAt: system.createdAt,
  };
}

export async function listSystems() {
  return prisma.system.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { files: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getSystem(id: number) {
  const system = await prisma.system.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { files: true } },
    },
  });

  if (!system) throw new NotFoundError('System');
  return system;
}

export async function updateSystem(id: number, input: UpdateSystemInput) {
  const system = await prisma.system.findUnique({ where: { id } });
  if (!system) throw new NotFoundError('System');

  return prisma.system.update({
    where: { id },
    data: input,
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function regenerateApiKey(id: number) {
  const system = await prisma.system.findUnique({ where: { id } });
  if (!system) throw new NotFoundError('System');

  const plainKey = generateApiKey(system.slug);
  const hashedKey = hashApiKey(plainKey);

  await prisma.system.update({
    where: { id },
    data: { apiKey: hashedKey },
  });

  return { apiKey: plainKey };
}

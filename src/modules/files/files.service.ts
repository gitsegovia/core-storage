import { PrismaClient, System } from '@prisma/client';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { nanoid } from 'nanoid';
import path from 'path';
import {
  buildDirectoryPath,
  buildRelativePath,
  ensureDirectory,
  getAbsolutePath,
  createFileStream,
  fileExists,
  deleteFile,
  sanitizeCollection,
} from './storage.service';
import { NotFoundError, BadRequestError } from '../../shared/errors';
import { FileListQuery } from './files.schema';

const prisma = new PrismaClient();

interface UploadInput {
  system: System;
  collectionPath: string;
  fileName: string;
  mimeType: string;
  fileStream: NodeJS.ReadableStream;
}

export async function uploadFile(input: UploadInput) {
  const { collection, subPath } = sanitizeCollection(input.collectionPath);

  // Generate unique stored name to avoid collisions
  const ext = path.extname(input.fileName);
  const baseName = path.basename(input.fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storedName = `${baseName}_${nanoid(8)}${ext}`;

  // Build paths
  const dirPath = buildDirectoryPath(input.system.slug, collection, subPath);
  const relativePath = buildRelativePath(input.system.slug, collection, storedName, subPath);
  const absolutePath = path.join(dirPath, storedName);

  // Ensure directory exists and write file
  await ensureDirectory(dirPath);
  await pipeline(input.fileStream, createWriteStream(absolutePath));

  // Get actual file size from disk
  const { stat } = await import('fs/promises');
  const stats = await stat(absolutePath);

  // Save metadata to DB
  const file = await prisma.file.create({
    data: {
      originalName: input.fileName,
      storedName,
      mimeType: input.mimeType,
      size: stats.size,
      collection,
      subPath: subPath || null,
      fullPath: relativePath,
      systemId: input.system.id,
    },
  });

  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: Number(file.size),
    collection: file.collection,
    subPath: file.subPath,
    createdAt: file.createdAt,
  };
}

export async function getFileInfo(fileId: string, systemId: number) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, systemId },
  });

  if (!file) throw new NotFoundError('File');

  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: Number(file.size),
    collection: file.collection,
    subPath: file.subPath,
    createdAt: file.createdAt,
  };
}

export async function downloadFile(fileId: string, systemId: number) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, systemId },
  });

  if (!file) throw new NotFoundError('File');

  const absolutePath = getAbsolutePath(file.fullPath);

  if (!(await fileExists(absolutePath))) {
    throw new NotFoundError('File on disk');
  }

  return {
    stream: createFileStream(absolutePath),
    mimeType: file.mimeType,
    originalName: file.originalName,
    size: Number(file.size),
  };
}

export async function listFiles(systemId: number, query: FileListQuery) {
  const where: any = { systemId };

  if (query.collection) where.collection = query.collection;
  if (query.mime_type) where.mimeType = { contains: query.mime_type };
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const skip = (query.page - 1) * query.limit;

  const [files, total] = await Promise.all([
    prisma.file.findMany({
      where,
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        collection: true,
        subPath: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.file.count({ where }),
  ]);

  return {
    data: files.map((f) => ({ ...f, size: Number(f.size) })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function deleteFileRecord(fileId: string, systemId: number) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, systemId },
  });

  if (!file) throw new NotFoundError('File');

  const absolutePath = getAbsolutePath(file.fullPath);

  // Delete from disk and DB
  await deleteFile(absolutePath);
  await prisma.file.delete({ where: { id: file.id } });

  return { deleted: true, id: file.id };
}

export async function listCollections(systemId: number) {
  const collections = await prisma.file.groupBy({
    by: ['collection'],
    where: { systemId },
    _count: { id: true },
    _sum: { size: true },
  });

  return collections.map((c) => ({
    collection: c.collection,
    fileCount: c._count.id,
    totalSize: Number(c._sum.size || 0),
  }));
}

import { mkdir, unlink, access, stat } from 'fs/promises';
import { createReadStream, ReadStream } from 'fs';
import path from 'path';
import { env } from '../../config/env';

/**
 * Build the directory path for a file.
 * Structure: {STORAGE_PATH}/{systemSlug}/{collection}/{subPath?}
 */
export function buildDirectoryPath(
  systemSlug: string,
  collection: string,
  subPath?: string,
): string {
  const parts = [env.STORAGE_PATH, systemSlug, collection];

  if (subPath) {
    const sanitized = subPath
      .split('/')
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/');
    if (sanitized) parts.push(sanitized);
  }

  return path.join(...parts);
}

/**
 * Build the relative path stored in DB (relative to STORAGE_PATH).
 */
export function buildRelativePath(
  systemSlug: string,
  collection: string,
  fileName: string,
  subPath?: string,
): string {
  const parts = [systemSlug, collection];

  if (subPath) {
    const sanitized = subPath
      .split('/')
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/');
    if (sanitized) parts.push(sanitized);
  }

  parts.push(fileName);
  return parts.join('/');
}

/** Ensure the target directory exists */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Get an absolute path from a relative stored path */
export function getAbsolutePath(relativePath: string): string {
  return path.join(env.STORAGE_PATH, relativePath);
}

/** Create a read stream for file download */
export function createFileStream(absolutePath: string): ReadStream {
  return createReadStream(absolutePath);
}

/** Check if a file exists on disk */
export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/** Delete a file from disk */
export async function deleteFile(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/** Get file size */
export async function getFileSize(absolutePath: string): Promise<number> {
  const stats = await stat(absolutePath);
  return stats.size;
}

/**
 * Validate and sanitize a collection path.
 * Allows: letters, numbers, hyphens, underscores.
 * Allows slashes to define sub-collections.
 */
export function sanitizeCollection(collection: string): {
  collection: string;
  subPath?: string;
} {
  const cleaned = collection.replace(/^\/+|\/+$/g, '');

  if (!cleaned) {
    throw new Error('Collection name cannot be empty');
  }

  const segments = cleaned.split('/').filter(Boolean);

  for (const seg of segments) {
    if (!/^[a-zA-Z0-9_-]+$/.test(seg)) {
      throw new Error(
        `Invalid path segment "${seg}". Only letters, numbers, hyphens and underscores are allowed.`,
      );
    }
  }

  const mainCollection = segments[0];
  const subPath = segments.length > 1 ? segments.slice(1).join('/') : undefined;

  return { collection: mainCollection, subPath };
}

/**
 * sync-files.ts
 * 
 * Escanea el filesystem de storage y registra en la DB cualquier archivo
 * que exista en disco pero no tenga registro.
 * 
 * Uso dentro del container:
 *   npx tsx scripts/sync-files.ts
 * 
 * Uso desde el host:
 *   docker exec core-storage npx tsx scripts/sync-files.ts
 */

import { PrismaClient } from '@prisma/client';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { lookup } from 'mime-types';

const prisma = new PrismaClient();

const STORAGE_PATH = process.env.STORAGE_PATH || '/data/storage';

interface FileEntry {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: bigint;
  collection: string;
  subPath: string | null;
  fullPath: string;
  systemSlug: string;
}

async function scanDirectory(dirPath: string, relativeTo: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await scanDirectory(fullPath, relativeTo);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(path.relative(relativeTo, fullPath));
    }
  }

  return files;
}

function parseFilePath(relativePath: string): FileEntry | null {
  // Expected structure: {systemSlug}/{collection}/{...subPath?}/{YYYY}/{MM}/{filename}
  const parts = relativePath.split('/');

  if (parts.length < 4) return null; // minimum: system/collection/YYYY/MM would be missing file

  const systemSlug = parts[0];
  const collection = parts[1];
  const fileName = parts[parts.length - 1];

  // Everything between collection and filename (excluding year/month at the end)
  // We need to detect where the year/month pattern is
  const middleParts = parts.slice(2, -1); // everything between collection and filename

  let subPathParts: string[] = [];
  let foundDate = false;

  for (let i = 0; i < middleParts.length; i++) {
    // Check if this looks like a year (4 digits)
    if (/^\d{4}$/.test(middleParts[i])) {
      foundDate = true;
      break;
    }
    subPathParts.push(middleParts[i]);
  }

  const subPath = subPathParts.length > 0 ? subPathParts.join('/') : null;

  const mimeType = lookup(fileName) || 'application/octet-stream';

  return {
    originalName: fileName,
    storedName: fileName,
    mimeType,
    size: BigInt(0), // will be updated after stat
    collection,
    subPath,
    fullPath: relativePath,
    systemSlug,
  };
}

async function main() {
  console.log(`Scanning ${STORAGE_PATH}...`);

  // Get all files on disk
  const allFiles = await scanDirectory(STORAGE_PATH, STORAGE_PATH);
  console.log(`Found ${allFiles.length} files on disk`);

  // Get all files already in DB
  const dbFiles = await prisma.file.findMany({ select: { fullPath: true } });
  const dbPaths = new Set(dbFiles.map((f) => f.fullPath));

  // Get all systems
  const systems = await prisma.system.findMany();
  const systemMap = new Map(systems.map((s) => [s.slug, s.id]));

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of allFiles) {
    // Skip if already in DB
    if (dbPaths.has(filePath)) {
      skipped++;
      continue;
    }

    const parsed = parseFilePath(filePath);
    if (!parsed) {
      console.warn(`  ⚠ Could not parse path: ${filePath}`);
      errors++;
      continue;
    }

    const systemId = systemMap.get(parsed.systemSlug);
    if (!systemId) {
      console.warn(`  ⚠ Unknown system "${parsed.systemSlug}" for: ${filePath}`);
      errors++;
      continue;
    }

    // Get actual file size
    const absolutePath = path.join(STORAGE_PATH, filePath);
    const stats = await stat(absolutePath);

    try {
      await prisma.file.create({
        data: {
          originalName: parsed.originalName,
          storedName: parsed.storedName,
          mimeType: parsed.mimeType,
          size: stats.size,
          collection: parsed.collection,
          subPath: parsed.subPath,
          fullPath: filePath,
          systemId,
        },
      });
      created++;
      console.log(`  ✓ ${filePath}`);
    } catch (err: any) {
      console.error(`  ✗ Error registering ${filePath}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already in DB): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

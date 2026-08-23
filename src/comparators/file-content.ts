// File content comparison between a local and a registry tarball.

import crypto from 'crypto';
import { findManifestPath, isManifestPath } from '../lib/manifest.ts';
import { untar } from '../lib/untar.ts';
import type { FileChange, FileComparison } from '../types.ts';

export async function comparePackageFiles(localTarball: Buffer, registryTarball: Buffer): Promise<FileComparison> {
  // Compared directly rather than by digest: two sha512 passes over
  // multi-megabyte buffers cost more than the comparison.
  if (buffersEqual(localTarball, registryTarball)) {
    return {
      identical: true,
      fileChanges: [],
      packageJsonOnly: false,
    };
  }

  const localFiles = await extractTarball(localTarball);
  const registryFiles = await extractTarball(registryTarball);

  const changes: FileChange[] = [];

  const allPaths: Record<string, boolean> = {};
  const localKeys = Object.keys(localFiles);
  for (let i = 0; i < localKeys.length; i++) {
    allPaths[localKeys[i]] = true;
  }
  const registryKeys = Object.keys(registryFiles);
  for (let i = 0; i < registryKeys.length; i++) {
    allPaths[registryKeys[i]] = true;
  }

  let onlyPackageJsonDiffers = true;

  const pathKeys = Object.keys(allPaths);
  for (let i = 0; i < pathKeys.length; i++) {
    const filePath = pathKeys[i];
    const isManifest = isManifestPath(filePath);
    const localContent = localFiles[filePath];
    const registryContent = registryFiles[filePath];

    if (!registryContent) {
      changes.push({ path: filePath, action: 'added' });
      if (!isManifest) onlyPackageJsonDiffers = false;
    } else if (!localContent) {
      changes.push({ path: filePath, action: 'removed' });
      if (!isManifest) onlyPackageJsonDiffers = false;
    } else if (!buffersEqual(localContent, registryContent)) {
      changes.push({ path: filePath, action: 'modified' });
      if (!isManifest) onlyPackageJsonDiffers = false;
    }
  }

  return {
    identical: changes.length === 0,
    fileChanges: changes,
    packageJsonOnly: onlyPackageJsonDiffers && changes.length > 0,
  };
}

function extractTarball(tarball: Buffer): Promise<Record<string, Buffer>> {
  return new Promise((resolve, reject) => {
    untar(tarball, (error, files) => (error ? reject(error) : resolve(files as Record<string, Buffer>)));
  });
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha512').update(buffer).digest('base64');
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  return Buffer.compare(a, b) === 0;
}

export function getFileChangeSummary(changes: FileChange[]): string {
  if (changes.length === 0) {
    return 'No file changes';
  }

  const added = changes.filter((c) => c.action === 'added');
  const removed = changes.filter((c) => c.action === 'removed');
  const modified = changes.filter((c) => c.action === 'modified');

  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(`${added.length} added`);
  }
  if (removed.length > 0) {
    parts.push(`${removed.length} removed`);
  }
  if (modified.length > 0) {
    parts.push(`${modified.length} modified`);
  }

  return `Files: ${parts.join(', ')} (${changes.length} total)`;
}

export function isOnlyPackageJsonChange(changes: FileChange[]): boolean {
  if (changes.length === 0) return false;

  for (let i = 0; i < changes.length; i++) {
    if (!isManifestPath(changes[i].path)) return false;
  }
  return true;
}

export async function extractPackageJson(tarball: Buffer): Promise<unknown> {
  const files = await extractTarball(tarball);

  const manifestPath = findManifestPath(files);
  if (!manifestPath) throw new Error('package.json not found in tarball');

  return JSON.parse(files[manifestPath].toString('utf8'));
}

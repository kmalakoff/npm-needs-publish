export const MANIFEST_PATH = 'package/package.json';

// The manifest is the package.json exactly one directory down. A package.json at
// any deeper path is shipped content - a fixture, a nested workspace - not the manifest.
export function isManifestPath(filePath: string): boolean {
  const parts = filePath.split('/');
  return parts.length === 2 && parts[1] === 'package.json';
}

export function findManifestPath(files: Record<string, Buffer>): string | null {
  if (files[MANIFEST_PATH]) return MANIFEST_PATH;
  const paths = Object.keys(files);
  for (let i = 0; i < paths.length; i++) {
    if (isManifestPath(paths[i])) return paths[i];
  }
  return null;
}

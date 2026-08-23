import spawn from 'cross-spawn-cb';
import type { PackageJson } from '../types.ts';
import { type RequestError, request } from './request.ts';

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

const USER_AGENT = 'npm-needs-publish';

export interface Packument {
  'dist-tags'?: Record<string, string>;
  versions: Record<string, PackageJson>;
}

export type RegistryCallback = (error: Error | null, registry?: string) => void;
export type PackumentCallback = (error: RequestError | null, packument?: Packument) => void;
export type TarballCallback = (error: RequestError | null, tarball?: Buffer) => void;

// Precedence: explicit override, scope-specific registry, default registry, public registry.
export function resolveRegistry(packageName: string, override: string | undefined, callback: RegistryCallback): void {
  if (override) return callback(null, override);

  const scope = packageName.charAt(0) === '@' ? packageName.split('/')[0] : null;
  if (!scope) return npmConfigGet('registry', (_err, value) => callback(null, value || DEFAULT_REGISTRY));

  npmConfigGet(`${scope}:registry`, (_scopeErr, scopeValue) => {
    if (scopeValue) return callback(null, scopeValue);
    npmConfigGet('registry', (_err, value) => callback(null, value || DEFAULT_REGISTRY));
  });
}

export function npmConfigGet(key: string, callback: (error: Error | null, value?: string) => void): void {
  // cross-spawn-cb resolves `npm` to `npm.cmd` on Windows; execFile does not.
  spawn('npm', ['config', 'get', key], { encoding: 'utf8' }, (error, res) => {
    if (error) return callback(null, undefined);
    const value = String((res && res.stdout) || '').trim();
    if (!value || value === 'undefined' || value === 'null') return callback(null, undefined);
    callback(null, value);
  });
}

// Errors carry code 'E404' when the package has never been published.
export function fetchPackument(registry: string, name: string, callback: PackumentCallback): void {
  const url = joinUrl(registry, encodePackageName(name));
  request(url, { accept: 'application/vnd.npm.install-v1+json', 'user-agent': USER_AGENT }, (error, body) => {
    if (error) return callback(error);
    try {
      callback(null, JSON.parse((body as Buffer).toString('utf8')) as Packument);
    } catch (err) {
      callback(err as RequestError);
    }
  });
}

export function fetchTarball(tarballUrl: string, callback: TarballCallback): void {
  request(tarballUrl, { 'user-agent': USER_AGENT }, callback);
}

// Scoped names are a single registry path segment, so the slash is escaped.
function encodePackageName(name: string): string {
  return name.charAt(0) === '@' ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

function joinUrl(base: string, suffix: string): string {
  return base.charAt(base.length - 1) === '/' ? base + suffix : `${base}/${suffix}`;
}

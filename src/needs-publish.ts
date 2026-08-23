// Orchestration for npm-needs-publish. See ALGORITHM.md for the full algorithm.

import fs from 'fs';
import path from 'path';
import { comparePackageFiles, comparePackageJson, extractPackageJson, hashBuffer } from './comparators/index.ts';
import { npmPack } from './lib/npmPack.ts';
import { fetchPackument, fetchTarball, type Packument, resolveRegistry } from './lib/registry.ts';
import type { ChangeDetail, NeedsPublishOptions, NeedsPublishResult, PackageJson } from './types.ts';

export type NeedsPublishCallback = (error: Error | null, result?: NeedsPublishResult) => void;

function needsPublishImpl(options: NeedsPublishOptions, callback: NeedsPublishCallback) {
  // Settle asynchronously and at most once: the callback must never fire before
  // needsPublishCb returns, on any code path.
  let settled = false;
  function done(error: Error | null, result?: NeedsPublishResult): void {
    if (settled) return;
    settled = true;
    setImmediate(() => callback(error, result));
  }

  (async () => {
    const cwd = options.cwd || process.cwd();

    // A missing or malformed manifest goes through the callback, not a sync throw.
    let localPkg: PackageJson;
    if (options.package) localPkg = options.package;
    else {
      try {
        localPkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as PackageJson;
      } catch (err) {
        return done(err as Error);
      }
    }

    if (localPkg.private) {
      return done(null, {
        needsPublish: false,
        reason: 'Package is private',
      });
    }

    let registryPkg: PackageJson;
    let registryTarball: Buffer;

    try {
      const registry = await promisify1<string, string | undefined, string>(resolveRegistry, localPkg.name, options.registry);
      const packument = await promisify1<string, string, Packument>(fetchPackument, registry, localPkg.name);

      const latestVersion = packument['dist-tags']?.latest;
      if (!latestVersion) {
        return done(null, {
          needsPublish: true,
          reason: 'No latest version found in registry (first publish)',
          changes: [{ type: 'first-publish', significance: 'critical' }],
        });
      }

      registryPkg = packument.versions[latestVersion];

      // Version differing is decisive; no need to compare contents.
      if (localPkg.version !== latestVersion) {
        return done(null, {
          needsPublish: true,
          reason: `Version differs (local: ${localPkg.version}, registry: ${latestVersion})`,
          changes: [
            {
              type: 'version',
              field: 'version',
              oldValue: latestVersion,
              newValue: localPkg.version,
              significance: 'critical',
            },
          ],
        });
      }

      const tarballUrl = registryPkg?.dist?.tarball;
      if (!tarballUrl) {
        return done(null, {
          needsPublish: true,
          reason: 'Registry package has no tarball URL',
          changes: [{ type: 'first-publish', significance: 'critical' }],
        });
      }

      registryTarball = await promisify0<string, Buffer>(fetchTarball, tarballUrl);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'E404') {
        return done(null, {
          needsPublish: true,
          reason: 'Package not found in registry (first publish)',
          changes: [{ type: 'first-publish', significance: 'critical' }],
        });
      }
      // Fail open: an unreachable registry must not silently skip a publish.
      return done(null, {
        needsPublish: true,
        reason: `Error checking registry: ${error.message || 'Unknown error'}`,
      });
    }

    let localTarball: Buffer;
    try {
      localTarball = await promisify0<string, Buffer>(npmPack, cwd);
    } catch (err: unknown) {
      const error = err as { message?: string };
      return done(null, {
        needsPublish: true,
        reason: `Error packing local package: ${error.message || 'Unknown error'}`,
      });
    }

    if (options.packageJsonOnly) {
      return done(null, await comparePackageJsonOnly(localTarball, registryTarball, options));
    }

    if (Buffer.compare(localTarball, registryTarball) === 0) {
      return done(null, {
        needsPublish: false,
        reason: `No changes detected (hash: ${hashBuffer(localTarball).substring(0, 16)}...)`,
      });
    }

    const fileComparison = await comparePackageFiles(localTarball, registryTarball);

    if (fileComparison.identical) {
      // Different npm versions gzip identical contents to different bytes.
      return done(null, {
        needsPublish: false,
        reason: 'Files identical (tarball metadata differs)',
      });
    }

    if (fileComparison.packageJsonOnly) {
      return done(null, await comparePackageJsonOnly(localTarball, registryTarball, options));
    }

    done(null, {
      needsPublish: true,
      reason: `Code changes detected (${fileComparison.fileChanges.length} files changed)`,
      changes: fileComparison.fileChanges.map((fc) => ({
        type: 'file' as const,
        field: fc.path,
        significance: 'significant' as const,
      })),
    });
  })().catch(done);
}

// Manifests come from the tarballs, not the packument, which drops fields such as `files`.
async function comparePackageJsonOnly(localTarball: Buffer, registryTarball: Buffer, options: NeedsPublishOptions): Promise<NeedsPublishResult> {
  const localTarballPkg = (await extractPackageJson(localTarball)) as PackageJson;
  const registryTarballPkg = (await extractPackageJson(registryTarball)) as PackageJson;

  const pkgJsonComparison = comparePackageJson(localTarballPkg, registryTarballPkg, {
    includeOptionalDeps: options.includeOptionalDeps,
    additionalSignificantFields: options.additionalSignificantFields,
    ignoreFields: options.ignoreFields,
    treatNarrowingAsEquivalent: options.treatNarrowingAsEquivalent,
  });

  if (!pkgJsonComparison.hasSignificantChanges) {
    return {
      needsPublish: false,
      reason: 'Package.json changes are not significant for consumers',
      changes: pkgJsonComparison.fieldChanges.map((fc) => ({
        type: 'field' as const,
        field: fc.field,
        oldValue: fc.oldValue,
        newValue: fc.newValue,
        significance: 'informational' as const,
      })),
    };
  }

  const changes: ChangeDetail[] = [
    ...pkgJsonComparison.fieldChanges.map((fc) => ({
      type: 'field' as const,
      field: fc.field,
      oldValue: fc.oldValue,
      newValue: fc.newValue,
      significance: fc.significance,
    })),
    ...pkgJsonComparison.dependencyChanges
      .filter((dc) => dc.semanticChange !== 'equivalent' && dc.semanticChange !== 'none')
      .map((dc) => ({
        type: 'dependency' as const,
        field: `${dc.type}.${dc.name}`,
        oldValue: dc.oldSpec,
        newValue: dc.newSpec,
        significance: 'significant' as const,
      })),
  ];

  return {
    needsPublish: true,
    reason: pkgJsonComparison.summary,
    changes,
  };
}

function promisify0<A, R>(fn: (a: A, cb: (error: Error | null, result?: R) => void) => void, a: A): Promise<R> {
  return new Promise((resolve, reject) => fn(a, (error, result) => (error ? reject(error) : resolve(result as R))));
}

function promisify1<A, B, R>(fn: (a: A, b: B, cb: (error: Error | null, result?: R) => void) => void, a: A, b: B): Promise<R> {
  return new Promise((resolve, reject) => fn(a, b, (error, result) => (error ? reject(error) : resolve(result as R))));
}

export function needsPublishCb(options: NeedsPublishOptions, callback: NeedsPublishCallback) {
  needsPublishImpl(options, callback);
}

/**
 * Determine if a package needs to be published to npm.
 *
 * @example
 * ```ts
 * import { needsPublish } from 'npm-needs-publish';
 *
 * const result = await needsPublish({ cwd: process.cwd() });
 * if (result.needsPublish) {
 *   console.log('Publish needed:', result.reason);
 * }
 * ```
 */
export function needsPublish(options: NeedsPublishOptions = {}): Promise<NeedsPublishResult> {
  return new Promise((resolve, reject) => needsPublishCb(options, (err, result) => (err || !result ? reject(err ?? new Error('Unknown error')) : resolve(result))));
}

/**
 * Main orchestration logic for npm-needs-publish
 *
 * Algorithm:
 * 1. Fetch registry packument → if E404, return needsPublish=true (first publish)
 * 2. Version check → if different, return needsPublish=true (intentional bump)
 * 3. Fast hash check → if identical, return needsPublish=false (no changes)
 * 4. Extract both tarballs, compare file-by-file (excluding package.json)
 * 5. If non-package.json files differ → return needsPublish=true
 * 6. If only package.json differs → do semantic comparison
 */

import fs from 'fs';
import Module from 'module';
import path from 'path';
import { stringStartsWith } from './compat.ts';
import type { ChangeDetail, NeedsPublishOptions, NeedsPublishResult, PackageJson } from './types.ts';

const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

/**
 * Callback type for needsPublish
 */
export type NeedsPublishCallback = (error: Error | null, result?: NeedsPublishResult) => void;

function needsPublishImpl(options: NeedsPublishOptions, callback: NeedsPublishCallback) {
  const cwd = options.cwd || process.cwd();

  // Load local package.json
  const localPkg: PackageJson = options.package || JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));

  // Skip private packages
  if (localPkg.private)
    return callback(null, {
      needsPublish: false,
      reason: 'Package is private',
    });

  (async () => {
    const pacote = _require('pacote');
    const Arborist = _require('@npmcli/arborist');
    const npa = _require('npm-package-arg');
    const { execFile } = _require('child_process');
    const { promisify } = _require('util');
    const execFileAsync = promisify(execFile);

    // Dynamic import for comparators (they use modern features)
    const { comparePackageFiles, comparePackageJson, extractPackageJson, hashBuffer } = await import('./comparators/index.ts');

    // Get registry URL for scoped packages
    let registry: string | undefined = options.registry;
    if (!registry) {
      const scope = stringStartsWith(localPkg.name, '@') ? localPkg.name.split('/')[0] : undefined;
      if (scope) {
        try {
          const { stdout } = await execFileAsync('npm', ['config', 'get', `${scope}:registry`]);
          registry = stdout.trim();
          if (registry === 'undefined') registry = undefined;
        } catch {
          // Fallback to default registry
        }
      }
    }

    // Step 1: Try to fetch registry packument
    let registryPkg: PackageJson;
    let registryTarball: Buffer;

    try {
      const packument = await pacote.packument(localPkg.name, {
        Arborist,
        ...(registry && { registry }),
      });

      const latestVersion = packument['dist-tags']?.latest;
      if (!latestVersion) {
        callback(null, {
          needsPublish: true,
          reason: 'No latest version found in registry (first publish)',
          changes: [{ type: 'first-publish', significance: 'critical' }],
        });
        return;
      }

      registryPkg = packument.versions[latestVersion] as unknown as PackageJson;

      // Step 2: Version comparison (fast path)
      if (localPkg.version !== latestVersion) {
        callback(null, {
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
        return;
      }

      // Fetch registry tarball for comparison
      const tarballUrl = registryPkg.dist?.tarball;
      if (!tarballUrl)
        return callback(null, {
          needsPublish: true,
          reason: 'Registry package has no tarball URL',
          changes: [{ type: 'first-publish', significance: 'critical' }],
        });

      registryTarball = await pacote.tarball(tarballUrl, {
        Arborist,
        integrity: registryPkg.dist?.integrity,
      });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      // Package not found in registry (first publish)
      if (error.code === 'E404') {
        callback(null, {
          needsPublish: true,
          reason: 'Package not found in registry (first publish)',
          changes: [{ type: 'first-publish', significance: 'critical' }],
        });
        return;
      }
      // Unknown error - assume changed to be safe
      callback(null, {
        needsPublish: true,
        reason: `Error checking registry: ${error.message || 'Unknown error'}`,
      });
      return;
    }

    // Step 3: Pack local package
    let localTarball: Buffer;
    try {
      const spec = npa(cwd);
      const manifest = await pacote.manifest(spec, { Arborist });
      localTarball = await pacote.tarball(manifest._resolved, {
        Arborist,
        integrity: manifest._integrity,
      });
    } catch (err: unknown) {
      const error = err as { message?: string };
      callback(null, {
        needsPublish: true,
        reason: `Error packing local package: ${error.message || 'Unknown error'}`,
      });
      return;
    }

    // Step 4: Fast hash comparison
    const localHash = hashBuffer(localTarball);
    const registryHash = hashBuffer(registryTarball);

    if (localHash === registryHash) {
      callback(null, {
        needsPublish: false,
        reason: `No changes detected (hash: ${localHash.substring(0, 16)}...)`,
      });
      return;
    }

    // Step 5: File-by-file comparison
    const fileComparison = await comparePackageFiles(localTarball, registryTarball);

    if (fileComparison.identical) {
      // Hash mismatch but files identical - likely tarball metadata difference
      callback(null, {
        needsPublish: false,
        reason: 'Files identical (tarball metadata differs)',
      });
      return;
    }

    // Step 6: If only package.json differs, do semantic comparison
    if (fileComparison.packageJsonOnly && !options.packageJsonOnly) {
      // Extract package.json from both tarballs for accurate comparison
      // (packument metadata is missing fields like 'files')
      const localTarballPkg = (await extractPackageJson(localTarball)) as PackageJson;
      const registryTarballPkg = (await extractPackageJson(registryTarball)) as PackageJson;

      const pkgJsonComparison = comparePackageJson(localTarballPkg, registryTarballPkg, {
        includeOptionalDeps: options.includeOptionalDeps,
        additionalSignificantFields: options.additionalSignificantFields,
        ignoreFields: options.ignoreFields,
        treatNarrowingAsEquivalent: options.treatNarrowingAsEquivalent,
      });

      if (!pkgJsonComparison.hasSignificantChanges) {
        callback(null, {
          needsPublish: false,
          reason: 'Package.json changes are not significant for consumers',
          changes: pkgJsonComparison.fieldChanges.map((fc) => ({
            type: 'field' as const,
            field: fc.field,
            oldValue: fc.oldValue,
            newValue: fc.newValue,
            significance: 'informational' as const,
          })),
        });
        return;
      }

      // Build changes list
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

      callback(null, {
        needsPublish: true,
        reason: pkgJsonComparison.summary,
        changes,
      });
      return;
    }

    // Step 7: Other files changed
    callback(null, {
      needsPublish: true,
      reason: `Code changes detected (${fileComparison.fileChanges.length} files changed)`,
      changes: fileComparison.fileChanges.map((fc) => ({
        type: 'file' as const,
        field: fc.path,
        significance: 'significant' as const,
      })),
    });
  })().catch(callback);
}

/**
 * Callback-based needsPublish
 */
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
  return new Promise((resolve, reject) => {
    needsPublishCb(options, (error, result) => {
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('No result returned'));
    });
  });
}

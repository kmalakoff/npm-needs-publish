/**
 * Package.json field comparison with significance classification
 *
 * Significant fields (affect consumers):
 * - name, version, main, module, browser, exports, types, typings, type
 * - bin, files, engines, os, cpu, peerDependenciesMeta, packageManager
 *
 * Not significant (metadata only):
 * - devDependencies, scripts, repository, homepage, bugs, author
 * - contributors, license, keywords, description, readme
 * - Internal npm fields (_id, _resolved, dist, etc.)
 */

import type { CompareOptions, DependencyChange, FieldChange, PackageJson, PackageJsonComparison } from '../types.ts';
import { compareDependencies, getDependencyChangeSummary } from './dependency.ts';

/**
 * Fields that affect consumers of the package
 */
const SIGNIFICANT_FIELDS: Record<string, boolean> = {
  // Identity
  name: true,
  version: true,

  // Entry points (critical for consumers)
  main: true,
  module: true,
  browser: true,
  exports: true,
  types: true,
  typings: true,
  type: true,

  // CLI
  bin: true,

  // Package contents
  files: true,

  // Compatibility constraints
  engines: true,
  os: true,
  cpu: true,

  // Peer dependency metadata
  peerDependenciesMeta: true,

  // Package manager constraints
  packageManager: true,
};

/**
 * Critical fields - changes here are very important
 */
const CRITICAL_FIELDS: Record<string, boolean> = {
  name: true,
  version: true,
  main: true,
  module: true,
  exports: true,
  bin: true,
  types: true,
  typings: true,
};

/**
 * Fields that should NEVER be considered significant
 */
const NEVER_SIGNIFICANT_FIELDS: Record<string, boolean> = {
  // Dev-only
  devDependencies: true,
  scripts: true,

  // Metadata (search/display only)
  repository: true,
  homepage: true,
  bugs: true,
  author: true,
  contributors: true,
  license: true,
  keywords: true,
  description: true,
  readme: true,
  readmeFilename: true,

  // npm internal
  private: true,
  _id: true,
  _from: true,
  _resolved: true,
  _integrity: true,
  _nodeVersion: true,
  _npmVersion: true,
  _npmUser: true,
  dist: true,
  gitHead: true,
  _shasum: true,
  _npmOperationalInternal: true,
};

/**
 * Compare two package.json objects semantically
 *
 * @param local - Local package.json
 * @param registry - Registry package.json
 * @param options - Comparison options
 * @returns Package comparison result
 */
export function comparePackageJson(local: PackageJson, registry: PackageJson, options?: CompareOptions): PackageJsonComparison {
  const fieldChanges: FieldChange[] = [];

  // Build object of fields to check
  const fieldsToCheck: Record<string, boolean> = {};
  const significantKeys = Object.keys(SIGNIFICANT_FIELDS);
  for (let i = 0; i < significantKeys.length; i++) {
    fieldsToCheck[significantKeys[i]] = true;
  }
  const additionalFields = options?.additionalSignificantFields || [];
  for (let i = 0; i < additionalFields.length; i++) {
    fieldsToCheck[additionalFields[i]] = true;
  }

  // Remove ignored fields
  const ignoreFields = options?.ignoreFields || [];
  for (let i = 0; i < ignoreFields.length; i++) {
    delete fieldsToCheck[ignoreFields[i]];
  }

  // Compare each significant field
  const fieldsToCheckKeys = Object.keys(fieldsToCheck);
  for (let i = 0; i < fieldsToCheckKeys.length; i++) {
    const field = fieldsToCheckKeys[i];
    const localValue = (local as unknown as Record<string, unknown>)[field];
    const registryValue = (registry as unknown as Record<string, unknown>)[field];

    if (!deepEqual(localValue, registryValue)) {
      // Special handling for 'exports' - complex conditional exports
      if (field === 'exports') {
        const exportsChange = compareExports(localValue, registryValue);
        if (exportsChange.hasSignificantDifference) {
          fieldChanges.push({
            field,
            oldValue: registryValue,
            newValue: localValue,
            significance: 'critical',
          });
        }
        continue;
      }

      // Special handling for 'bin' - normalize before comparison
      if (field === 'bin') {
        const normalizedLocal = normalizeBin(localValue, local.name);
        const normalizedRegistry = normalizeBin(registryValue, registry.name);
        if (deepEqual(normalizedLocal, normalizedRegistry)) {
          continue; // No actual change
        }
      }

      fieldChanges.push({
        field,
        oldValue: registryValue,
        newValue: localValue,
        significance: getFieldSignificance(field, options?.additionalSignificantFields),
      });
    }
  }

  // Compare dependencies separately
  const depComparison = compareDependencies(local, registry, {
    includeOptionalDeps: options?.includeOptionalDeps,
    treatNarrowingAsEquivalent: options?.treatNarrowingAsEquivalent,
  });

  // Determine if there are significant changes
  const hasSignificantFieldChanges = fieldChanges.some((c) => c.significance === 'critical' || c.significance === 'significant');

  const hasSignificantChanges = hasSignificantFieldChanges || depComparison.hasChanges;

  return {
    hasSignificantChanges,
    fieldChanges,
    dependencyChanges: depComparison.changes,
    summary: generateSummary(fieldChanges, depComparison.changes),
  };
}

/**
 * Get the significance level of a field
 */
function getFieldSignificance(field: string, additionalSignificantFields?: string[]): 'critical' | 'significant' | 'informational' {
  if (CRITICAL_FIELDS[field]) return 'critical';
  if (SIGNIFICANT_FIELDS[field]) return 'significant';
  if (additionalSignificantFields && additionalSignificantFields.indexOf(field) >= 0) return 'significant';
  return 'informational';
}

/**
 * Compare exports field with special handling for conditional exports
 */
function compareExports(localExports: unknown, registryExports: unknown): { hasSignificantDifference: boolean } {
  // If both are undefined/null, no difference
  if (localExports == null && registryExports == null) {
    return { hasSignificantDifference: false };
  }

  // If only one is defined, that's significant
  if (localExports == null || registryExports == null) {
    return { hasSignificantDifference: true };
  }

  // Normalize exports to object form
  const normalizedLocal = normalizeExports(localExports);
  const normalizedRegistry = normalizeExports(registryExports);

  // Deep compare normalized exports
  return { hasSignificantDifference: !deepEqual(normalizedLocal, normalizedRegistry) };
}

/**
 * Normalize exports field to object form
 */
function normalizeExports(exports: unknown): unknown {
  // String exports: "./index.js" -> { ".": "./index.js" }
  if (typeof exports === 'string') {
    return { '.': exports };
  }

  // Array exports are less common but valid
  if (Array.isArray(exports)) {
    return { '.': exports };
  }

  // Already an object
  return exports;
}

/**
 * Normalize bin field to object form
 */
function normalizeBin(bin: unknown, packageName: string): Record<string, string> | undefined {
  if (bin == null) return undefined;

  // String bin: "cli.js" -> { "package-name": "cli.js" }
  if (typeof bin === 'string') {
    // Use the package name without scope as the bin name
    const binName = packageName.startsWith('@') ? packageName.split('/')[1] : packageName;
    return { [binName]: bin };
  }

  // Already an object
  if (typeof bin === 'object') {
    return bin as Record<string, string>;
  }

  return undefined;
}

/**
 * Deep equality comparison
 */
function deepEqual(a: unknown, b: unknown): boolean {
  // Identical references or primitives
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return a === b;

  // Different types
  if (typeof a !== typeof b) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);

    if (keysA.length !== keysB.length) return false;

    for (let i = 0; i < keysA.length; i++) {
      const key = keysA[i];
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Generate a summary of changes
 */
function generateSummary(fieldChanges: FieldChange[], dependencyChanges: DependencyChange[]): string {
  const parts: string[] = [];

  // Summarize field changes
  const criticalFields = fieldChanges.filter((c) => c.significance === 'critical');
  const significantFields = fieldChanges.filter((c) => c.significance === 'significant');

  if (criticalFields.length > 0) {
    const names = criticalFields.map((c) => c.field).join(', ');
    parts.push(`Critical field changes: ${names}`);
  }

  if (significantFields.length > 0) {
    const names = significantFields.map((c) => c.field).join(', ');
    parts.push(`Significant field changes: ${names}`);
  }

  // Summarize dependency changes
  if (dependencyChanges.length > 0) {
    parts.push(getDependencyChangeSummary(dependencyChanges));
  }

  if (parts.length === 0) {
    return 'No significant changes';
  }

  return parts.join('; ');
}

/**
 * Check if a field is significant
 */
export function isSignificantField(field: string, options?: CompareOptions): boolean {
  // Explicitly ignored
  if (options?.ignoreFields && options.ignoreFields.indexOf(field) >= 0) return false;

  // Explicitly added
  if (options?.additionalSignificantFields && options.additionalSignificantFields.indexOf(field) >= 0) return true;

  // Never significant
  if (NEVER_SIGNIFICANT_FIELDS[field]) return false;

  // Default significant fields
  return !!SIGNIFICANT_FIELDS[field];
}

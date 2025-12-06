/**
 * Dependency comparison with semver-aware logic
 *
 * Handles different dependency types:
 * - dependencies: SIGNIFICANT (installed by consumers)
 * - peerDependencies: SIGNIFICANT (affects peer requirements)
 * - optionalDependencies: SIGNIFICANT (configurable, can affect behavior)
 * - bundledDependencies: SIGNIFICANT (included in package)
 * - devDependencies: NOT SIGNIFICANT (not in published package)
 */

import type { DependencyChange, DependencyCompareOptions, DependencyComparison, PackageJson } from '../types.ts';
import { compareVersionSpecifiers, comparisonToSemanticChange, type SemanticChangeOptions } from './version-specifier.ts';

/**
 * Dependency types that affect the published package
 */
const SIGNIFICANT_DEP_TYPES = ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies'] as const;

type SignificantDepType = (typeof SIGNIFICANT_DEP_TYPES)[number];

/**
 * Compare dependencies between two package.json objects
 *
 * @param local - Local package.json
 * @param registry - Registry package.json
 * @param options - Comparison options
 * @returns Dependency comparison result
 */
export function compareDependencies(local: PackageJson, registry: PackageJson, options?: DependencyCompareOptions): DependencyComparison {
  const changes: DependencyChange[] = [];
  const includeOptional = options?.includeOptionalDeps !== false;

  // Filter dependency types based on options
  const depTypes = SIGNIFICANT_DEP_TYPES.filter((type) => {
    if (type === 'optionalDependencies' && !includeOptional) return false;
    return true;
  });

  // Build semantic change options from dependency options
  const semanticOpts: SemanticChangeOptions = {
    treatNarrowingAsEquivalent: options?.treatNarrowingAsEquivalent,
  };

  for (let i = 0; i < depTypes.length; i++) {
    const depType = depTypes[i];
    if (depType === 'bundledDependencies') {
      // Handle bundledDependencies specially (array format)
      const bundledChanges = compareBundledDeps(local, registry);
      changes.push.apply(changes, bundledChanges);
    } else {
      // Handle regular dependency objects
      const localDeps = (local[depType] as Record<string, string>) || {};
      const registryDeps = (registry[depType] as Record<string, string>) || {};
      const depChanges = compareDependencyObject(localDeps, registryDeps, depType, semanticOpts);
      changes.push.apply(changes, depChanges);
    }
  }

  // Separate significant changes (those that aren't equivalent)
  const significantChanges = changes.filter((c) => c.semanticChange !== 'equivalent' && c.semanticChange !== 'none');

  return {
    hasChanges: significantChanges.length > 0,
    changes,
    significantChanges,
  };
}

/**
 * Compare two dependency objects
 */
function compareDependencyObject(localDeps: Record<string, string>, registryDeps: Record<string, string>, depType: SignificantDepType, semanticOpts?: SemanticChangeOptions): DependencyChange[] {
  const changes: DependencyChange[] = [];

  // Find added and changed dependencies
  const localNames = Object.keys(localDeps);
  for (let i = 0; i < localNames.length; i++) {
    const name = localNames[i];
    const localSpec = localDeps[name];
    const registrySpec = registryDeps[name];

    if (!registrySpec) {
      // New dependency added
      changes.push({
        name,
        type: depType,
        action: 'added',
        newSpec: localSpec,
        semanticChange: 'incompatible',
      });
    } else if (localSpec !== registrySpec) {
      // Dependency changed - compare semantically
      const comparison = compareVersionSpecifiers(registrySpec, localSpec);
      changes.push({
        name,
        type: depType,
        action: 'changed',
        oldSpec: registrySpec,
        newSpec: localSpec,
        semanticChange: comparisonToSemanticChange(comparison, semanticOpts),
      });
    }
    // If specs are identical, no change to record
  }

  // Find removed dependencies
  const registryNames = Object.keys(registryDeps);
  for (let i = 0; i < registryNames.length; i++) {
    const name = registryNames[i];
    const registrySpec = registryDeps[name];
    if (!(name in localDeps)) {
      changes.push({
        name,
        type: depType,
        action: 'removed',
        oldSpec: registrySpec,
        semanticChange: 'incompatible',
      });
    }
  }

  return changes;
}

/**
 * Compare bundledDependencies arrays
 * Handles both bundledDependencies and bundleDependencies spellings
 */
function compareBundledDeps(local: PackageJson, registry: PackageJson): DependencyChange[] {
  const changes: DependencyChange[] = [];

  // Get bundled deps from both, handling both spellings
  const localBundledArray = local.bundledDependencies || local.bundleDependencies || [];
  const registryBundledArray = registry.bundledDependencies || registry.bundleDependencies || [];

  // Convert to lookup objects
  const localBundled: Record<string, boolean> = {};
  for (let i = 0; i < localBundledArray.length; i++) {
    localBundled[localBundledArray[i]] = true;
  }
  const registryBundled: Record<string, boolean> = {};
  for (let i = 0; i < registryBundledArray.length; i++) {
    registryBundled[registryBundledArray[i]] = true;
  }

  // Find added bundled deps
  for (let i = 0; i < localBundledArray.length; i++) {
    const name = localBundledArray[i];
    if (!registryBundled[name]) {
      changes.push({
        name,
        type: 'bundledDependencies',
        action: 'added',
        semanticChange: 'incompatible',
      });
    }
  }

  // Find removed bundled deps
  for (let i = 0; i < registryBundledArray.length; i++) {
    const name = registryBundledArray[i];
    if (!localBundled[name]) {
      changes.push({
        name,
        type: 'bundledDependencies',
        action: 'removed',
        semanticChange: 'incompatible',
      });
    }
  }

  return changes;
}

/**
 * Check if any significant dependency changes exist
 */
export function hasSignificantDependencyChanges(local: PackageJson, registry: PackageJson, options?: DependencyCompareOptions): boolean {
  const comparison = compareDependencies(local, registry, options);
  return comparison.hasChanges;
}

/**
 * Get a human-readable summary of dependency changes
 */
export function getDependencyChangeSummary(changes: DependencyChange[]): string {
  if (changes.length === 0) {
    return 'No dependency changes';
  }

  const added = changes.filter((c) => c.action === 'added');
  const removed = changes.filter((c) => c.action === 'removed');
  const changed = changes.filter((c) => c.action === 'changed');
  const significant = changes.filter((c) => c.semanticChange !== 'equivalent' && c.semanticChange !== 'none');

  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(`${added.length} added`);
  }
  if (removed.length > 0) {
    parts.push(`${removed.length} removed`);
  }
  if (changed.length > 0) {
    const semanticallyChanged = changed.filter((c) => c.semanticChange !== 'equivalent' && c.semanticChange !== 'none');
    if (semanticallyChanged.length > 0) {
      parts.push(`${semanticallyChanged.length} significantly changed`);
    }
    const equivalent = changed.filter((c) => c.semanticChange === 'equivalent' || c.semanticChange === 'none');
    if (equivalent.length > 0) {
      parts.push(`${equivalent.length} equivalent changes`);
    }
  }

  const summary = parts.join(', ');
  return `Dependencies: ${summary} (${significant.length} significant)`;
}

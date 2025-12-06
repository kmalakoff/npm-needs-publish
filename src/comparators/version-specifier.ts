/**
 * Version specifier parsing and comparison
 *
 * Handles ALL npm version specifier formats:
 * - Exact: 1.2.3
 * - Caret: ^1.2.3
 * - Tilde: ~1.2.3
 * - Range: >=1.0.0 <2.0.0
 * - X-range: 1.x, 1.2.x, *
 * - Hyphen: 1.2.3 - 2.3.4
 * - OR: >=1.0.0 || >=2.0.0
 * - Git: git+https://...
 * - File: file:../local
 * - Alias: npm:package@version
 * - Workspace: workspace:*, workspace:^
 * - Tag: latest, next
 * - URL: http(s) URLs to tarballs
 */

import Module from 'module';
import type { CompareSpecifierOptions, ParsedVersionSpecifier, SemanticChange, SpecifierComparison, VersionSpecifierType } from '../types.ts';

const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

// Lazy load dependencies
let _semver: typeof import('semver') | null = null;
let _npa: typeof import('npm-package-arg') | null = null;

function getSemver(): typeof import('semver') {
  if (!_semver) {
    _semver = _require('semver');
  }
  return _semver;
}

function getNpa(): typeof import('npm-package-arg') {
  if (!_npa) {
    _npa = _require('npm-package-arg');
  }
  return _npa;
}

/**
 * Parse a version specifier into its components
 */
export function parseVersionSpecifier(spec: string, where?: string): ParsedVersionSpecifier {
  const semver = getSemver();
  const npa = getNpa();

  // Handle workspace protocol first (not handled by npa)
  if (spec.startsWith('workspace:')) {
    const workspaceRange = spec.slice(10);
    return {
      type: 'workspace',
      raw: spec,
      normalized: spec,
      workspaceRange: workspaceRange || '*',
    };
  }

  // Handle empty string
  if (!spec || spec === '') {
    return {
      type: 'x-range',
      raw: spec,
      normalized: '*',
    };
  }

  try {
    // Use npm-package-arg for standard parsing
    const parsed = npa.resolve('pkg', spec, where);

    switch (parsed.type) {
      case 'version':
        return {
          type: 'exact',
          raw: spec,
          normalized: parsed.fetchSpec || spec,
        };

      case 'range': {
        const rangeType = detectRangeSubtype(spec);
        let normalized = spec;
        try {
          const range = new semver.Range(parsed.fetchSpec || spec, { loose: true });
          normalized = range.range || spec;
        } catch {
          // Keep original if normalization fails
        }
        return {
          type: rangeType,
          raw: spec,
          normalized,
        };
      }

      case 'tag':
        return {
          type: 'tag',
          raw: spec,
          normalized: parsed.fetchSpec || spec,
        };

      case 'git':
        return {
          type: 'git',
          raw: spec,
          normalized: parsed.saveSpec || spec,
          gitInfo: {
            url: parsed.fetchSpec || '',
            committish: parsed.gitCommittish || undefined,
            semverRange: parsed.gitRange || undefined,
          },
        };

      case 'remote':
        return {
          type: 'url',
          raw: spec,
          normalized: parsed.fetchSpec || spec,
        };

      case 'file':
      case 'directory':
        return {
          type: 'file',
          raw: spec,
          normalized: parsed.saveSpec || spec,
        };

      case 'alias': {
        // Recursively parse the underlying spec
        const subSpec = parsed.subSpec;
        if (subSpec) {
          return {
            type: 'alias',
            raw: spec,
            normalized: spec,
            aliasTarget: parseVersionSpecifier(subSpec.rawSpec, where),
          };
        }
        return {
          type: 'alias',
          raw: spec,
          normalized: spec,
        };
      }

      default:
        // Try to parse as semver range
        try {
          const range = new semver.Range(spec, { loose: true });
          return {
            type: detectRangeSubtype(spec),
            raw: spec,
            normalized: range.range || spec,
          };
        } catch {
          // Unknown type
          return {
            type: 'tag',
            raw: spec,
            normalized: spec,
          };
        }
    }
  } catch {
    // Try to parse as semver range
    try {
      const range = new semver.Range(spec, { loose: true });
      return {
        type: detectRangeSubtype(spec),
        raw: spec,
        normalized: range.range || spec,
      };
    } catch {
      // Treat as tag
      return {
        type: 'tag',
        raw: spec,
        normalized: spec,
      };
    }
  }
}

/**
 * Detect the subtype of a semver range
 */
function detectRangeSubtype(spec: string): VersionSpecifierType {
  const trimmed = spec.trim();

  if (trimmed.startsWith('^')) return 'caret';
  if (trimmed.startsWith('~')) return 'tilde';
  if (trimmed.includes(' - ')) return 'hyphen';
  if (trimmed.includes('||')) return 'or';
  if (/[xX*]/.test(trimmed) || trimmed === '') return 'x-range';

  // Check if it's an exact version
  const semver = getSemver();
  if (semver.valid(trimmed)) return 'exact';

  return 'range';
}

/**
 * Extract major and minor version from a semver range
 * Uses semver.minVersion to get the minimum satisfying version
 */
function extractMajorMinor(spec: string): { major: number; minor: number } | null {
  const semver = getSemver();
  try {
    const range = new semver.Range(spec, { loose: true });
    const minVersion = semver.minVersion(range);
    if (!minVersion) return null;
    return { major: minVersion.major, minor: minVersion.minor };
  } catch {
    return null;
  }
}

/**
 * Compare two version specifiers for semantic equivalence
 *
 * @returns Whether the two specifiers would resolve to the same set of versions
 */
export function compareVersionSpecifiers(specA: string, specB: string, options?: CompareSpecifierOptions): SpecifierComparison {
  // Fast path: identical strings
  if (specA === specB) {
    return { equivalent: true, relation: 'identical' };
  }

  // Parse both specifiers
  const parsedA = parseVersionSpecifier(specA, options?.where);
  const parsedB = parseVersionSpecifier(specB, options?.where);

  // Handle workspace protocol specially
  if (parsedA.type === 'workspace' || parsedB.type === 'workspace') {
    return compareWorkspaceSpecs(parsedA, parsedB);
  }

  // Handle alias types - compare underlying specs
  if (parsedA.type === 'alias' || parsedB.type === 'alias') {
    return compareAliasSpecs(parsedA, parsedB, options);
  }

  // Different types are generally not equivalent
  if (getSpecCategory(parsedA.type) !== getSpecCategory(parsedB.type)) {
    return { equivalent: false, relation: 'incompatible-types' };
  }

  // Type-specific comparison
  switch (parsedA.type) {
    case 'exact':
    case 'caret':
    case 'tilde':
    case 'range':
    case 'x-range':
    case 'hyphen':
    case 'or':
      return compareSemverSpecs(specA, specB);

    case 'git':
      return compareGitSpecs(parsedA, parsedB);

    case 'file':
      return compareFileSpecs(parsedA, parsedB);

    case 'tag':
      return compareTagSpecs(parsedA, parsedB);

    case 'url':
      return compareUrlSpecs(parsedA, parsedB);

    default:
      return { equivalent: false, relation: 'unknown-type' };
  }
}

/**
 * Get the category of a specifier type for comparison purposes
 */
function getSpecCategory(type: VersionSpecifierType): string {
  switch (type) {
    case 'exact':
    case 'caret':
    case 'tilde':
    case 'range':
    case 'x-range':
    case 'hyphen':
    case 'or':
      return 'semver';
    case 'git':
      return 'git';
    case 'file':
      return 'file';
    case 'tag':
      return 'tag';
    case 'url':
      return 'url';
    case 'alias':
      return 'alias';
    case 'workspace':
      return 'workspace';
    default:
      return 'unknown';
  }
}

/**
 * Compare two semver-based specifiers
 */
function compareSemverSpecs(specA: string, specB: string): SpecifierComparison {
  const semver = getSemver();

  let rangeA: InstanceType<typeof semver.Range>;
  let rangeB: InstanceType<typeof semver.Range>;

  try {
    rangeA = new semver.Range(specA, { loose: true });
    rangeB = new semver.Range(specB, { loose: true });
  } catch {
    // One or both are not valid semver ranges
    return { equivalent: false, relation: 'incompatible-types' };
  }

  // Normalize to canonical form for string comparison
  const normalizedA = rangeA.range;
  const normalizedB = rangeB.range;

  if (normalizedA === normalizedB) {
    return { equivalent: true, relation: 'normalized-equal' };
  }

  // Check if both are caret ranges with same major version
  // This handles ncu -u scenarios like ^4.17.0 → ^4.17.21 or ^4.17.0 → ^4.18.0
  if (specA.trim().startsWith('^') && specB.trim().startsWith('^')) {
    const boundsA = extractMajorMinor(specA);
    const boundsB = extractMajorMinor(specB);
    if (boundsA && boundsB && boundsA.major === boundsB.major) {
      return { equivalent: true, relation: 'same-major-caret' };
    }
  }

  // Check if both are tilde ranges with same major.minor version
  // This handles scenarios like ~4.17.0 → ~4.17.5
  if (specA.trim().startsWith('~') && specB.trim().startsWith('~')) {
    const boundsA = extractMajorMinor(specA);
    const boundsB = extractMajorMinor(specB);
    if (boundsA && boundsB && boundsA.major === boundsB.major && boundsA.minor === boundsB.minor) {
      return { equivalent: true, relation: 'same-minor-tilde' };
    }
  }

  // Use semver.subset to determine relationship
  // A is subset of B means A is more restrictive (all versions in A are in B)
  // We need to check both directions to determine equivalence
  let aSubsetB = false;
  let bSubsetA = false;

  try {
    aSubsetB = semver.subset(rangeA, rangeB, { includePrerelease: true });
  } catch {
    // subset can throw on complex ranges
  }

  try {
    bSubsetA = semver.subset(rangeB, rangeA, { includePrerelease: true });
  } catch {
    // subset can throw on complex ranges
  }

  if (aSubsetB && bSubsetA) {
    // Equivalent ranges (different syntax, same meaning)
    return { equivalent: true, relation: 'semantically-equal' };
  }

  if (bSubsetA) {
    // New (B) is subset of old (A) → new is more restrictive (narrowed)
    // Example: * → ^4.17.0 (constrains to v4.x)
    return { equivalent: false, relation: 'narrowed', detail: 'new range is subset of old' };
  }

  if (aSubsetB) {
    // Old (A) is subset of new (B) → new is less restrictive (widened)
    // Example: ^4.17.0 → * (allows any version)
    return { equivalent: false, relation: 'widened', detail: 'old range is subset of new' };
  }

  // Check if they intersect at all
  const intersects = rangeA.intersects(rangeB);
  return {
    equivalent: false,
    relation: intersects ? 'partially-overlapping' : 'disjoint',
  };
}

/**
 * Compare git specifiers
 */
function compareGitSpecs(parsedA: ParsedVersionSpecifier, parsedB: ParsedVersionSpecifier): SpecifierComparison {
  // For git specs, compare URL and committish
  const gitA = parsedA.gitInfo;
  const gitB = parsedB.gitInfo;

  if (!gitA || !gitB) {
    return { equivalent: false, relation: 'incompatible-types' };
  }

  // URLs must match
  if (gitA.url !== gitB.url) {
    return { equivalent: false, relation: 'disjoint', detail: 'Different git URLs' };
  }

  // If both have committish, compare them
  if (gitA.committish && gitB.committish) {
    if (gitA.committish === gitB.committish) {
      return { equivalent: true, relation: 'identical' };
    }
    return { equivalent: false, relation: 'disjoint', detail: 'Different committish' };
  }

  // If both have semver ranges, compare them
  if (gitA.semverRange && gitB.semverRange) {
    return compareSemverSpecs(gitA.semverRange, gitB.semverRange);
  }

  // Mixed or missing - treat as different
  return { equivalent: false, relation: 'incompatible-types' };
}

/**
 * Compare file/directory specifiers
 * File specs are always treated as different since we can't compare their contents
 */
function compareFileSpecs(parsedA: ParsedVersionSpecifier, parsedB: ParsedVersionSpecifier): SpecifierComparison {
  // File paths must be identical to be considered equivalent
  if (parsedA.normalized === parsedB.normalized) {
    return { equivalent: true, relation: 'identical' };
  }
  // Different file paths - always treat as different
  return { equivalent: false, relation: 'disjoint', detail: 'Different file paths' };
}

/**
 * Compare workspace specifiers
 */
function compareWorkspaceSpecs(parsedA: ParsedVersionSpecifier, parsedB: ParsedVersionSpecifier): SpecifierComparison {
  // Both must be workspace
  if (parsedA.type !== 'workspace' || parsedB.type !== 'workspace') {
    return { equivalent: false, relation: 'incompatible-types' };
  }

  // Compare the underlying workspace ranges
  const rangeA = parsedA.workspaceRange || '*';
  const rangeB = parsedB.workspaceRange || '*';

  if (rangeA === rangeB) {
    return { equivalent: true, relation: 'identical' };
  }

  // Workspace ranges like * and ^ have specific meanings
  // * = use exact version from workspace
  // ^ = use caret range
  // ~ = use tilde range
  // For comparison purposes, treat different symbols as different
  return { equivalent: false, relation: 'disjoint', detail: 'Different workspace specifiers' };
}

/**
 * Compare tag specifiers (latest, next, etc.)
 * Tags are resolved at install time, so we can't compare them semantically
 */
function compareTagSpecs(parsedA: ParsedVersionSpecifier, parsedB: ParsedVersionSpecifier): SpecifierComparison {
  // Tags must be identical to be considered equivalent
  if (parsedA.normalized === parsedB.normalized) {
    return { equivalent: true, relation: 'identical' };
  }
  // Different tags - always treat as potentially different
  return { equivalent: false, relation: 'disjoint', detail: 'Different tags' };
}

/**
 * Compare URL specifiers
 */
function compareUrlSpecs(parsedA: ParsedVersionSpecifier, parsedB: ParsedVersionSpecifier): SpecifierComparison {
  // URLs must be identical to be considered equivalent
  if (parsedA.normalized === parsedB.normalized) {
    return { equivalent: true, relation: 'identical' };
  }
  return { equivalent: false, relation: 'disjoint', detail: 'Different URLs' };
}

/**
 * Compare alias specifiers by comparing their underlying targets
 */
function compareAliasSpecs(parsedA: ParsedVersionSpecifier, parsedB: ParsedVersionSpecifier, options?: CompareSpecifierOptions): SpecifierComparison {
  // If both are aliases, compare their targets
  if (parsedA.type === 'alias' && parsedB.type === 'alias') {
    if (parsedA.aliasTarget && parsedB.aliasTarget) {
      return compareVersionSpecifiers(parsedA.aliasTarget.raw, parsedB.aliasTarget.raw, options);
    }
  }

  // If only one is alias, compare the alias target with the other spec
  if (parsedA.type === 'alias' && parsedA.aliasTarget) {
    return compareVersionSpecifiers(parsedA.aliasTarget.raw, parsedB.raw, options);
  }

  if (parsedB.type === 'alias' && parsedB.aliasTarget) {
    return compareVersionSpecifiers(parsedA.raw, parsedB.aliasTarget.raw, options);
  }

  return { equivalent: false, relation: 'incompatible-types' };
}

/**
 * Options for comparisonToSemanticChange
 */
export interface SemanticChangeOptions {
  /** Treat narrowed ranges as equivalent @default true */
  treatNarrowingAsEquivalent?: boolean;
}

/**
 * Map a specifier comparison to a semantic change type
 */
export function comparisonToSemanticChange(comparison: SpecifierComparison, options?: SemanticChangeOptions): SemanticChange {
  const treatNarrowingAsEquivalent = options?.treatNarrowingAsEquivalent !== false;

  if (comparison.equivalent) {
    return comparison.relation === 'identical' ? 'none' : 'equivalent';
  }

  switch (comparison.relation) {
    case 'narrowed':
      // When treatNarrowingAsEquivalent is true (default), narrowing is safe
      return treatNarrowingAsEquivalent ? 'equivalent' : 'narrowed';
    case 'widened':
      return 'widened';
    default:
      return 'incompatible';
  }
}

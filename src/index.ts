/**
 * npm-needs-publish
 *
 * Smart publish detection for npm packages - semantic package.json comparison
 * with semver-aware dependency analysis
 *
 * @example
 * ```typescript
 * import { needsPublish } from 'npm-needs-publish';
 *
 * const result = await needsPublish({ cwd: process.cwd() });
 * if (result.needsPublish) {
 *   console.log('Publish needed:', result.reason);
 *   // Proceed with npm publish
 * } else {
 *   console.log('No publish needed:', result.reason);
 * }
 * ```
 */

// Comparators
export { compareDependencies } from './comparators/dependency.ts';
export { extractPackageJson } from './comparators/file-content.ts';
export { comparePackageJson } from './comparators/package-json.ts';
export { compareVersionSpecifiers, comparisonToSemanticChange, parseVersionSpecifier, type SemanticChangeOptions } from './comparators/version-specifier.ts';
// Main API
export { type NeedsPublishCallback, needsPublish, needsPublishCb } from './needs-publish.ts';

// Types
export type {
  ChangeDetail,
  CompareOptions,
  CompareSpecifierOptions,
  DependencyChange,
  DependencyCompareOptions,
  DependencyComparison,
  FieldChange,
  FileChange,
  FileComparison,
  NeedsPublishOptions,
  NeedsPublishResult,
  PackageJson,
  PackageJsonComparison,
  ParsedVersionSpecifier,
  SemanticChange,
  SpecifierComparison,
  VersionSpecifierType,
} from './types.ts';

/**
 * Comparators - Core comparison logic for npm-needs-publish
 */

export {
  compareDependencies,
  getDependencyChangeSummary,
  hasSignificantDependencyChanges,
} from './dependency.ts';
export {
  comparePackageFiles,
  getFileChangeSummary,
  hashBuffer,
  isOnlyPackageJsonChange,
} from './file-content.ts';

export {
  comparePackageJson,
  isSignificantField,
} from './package-json.ts';
export {
  compareVersionSpecifiers,
  comparisonToSemanticChange,
  parseVersionSpecifier,
  type SemanticChangeOptions,
} from './version-specifier.ts';

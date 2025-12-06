/**
 * Types for npm-needs-publish
 */

/**
 * Standard package.json structure (partial, relevant fields only)
 */
export interface PackageJson {
  name: string;
  version: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  exports?: string | Record<string, unknown>;
  types?: string;
  typings?: string;
  type?: 'module' | 'commonjs';
  bin?: string | Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[];
  bundleDependencies?: string[]; // Alternative spelling
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  packageManager?: string;
  scripts?: Record<string, string>;
  repository?: string | { type?: string; url?: string };
  homepage?: string;
  bugs?: string | { url?: string; email?: string };
  author?: string | { name?: string; email?: string; url?: string };
  contributors?: Array<string | { name?: string; email?: string; url?: string }>;
  license?: string;
  keywords?: string[];
  description?: string;
  private?: boolean;
  // npm internal fields
  _id?: string;
  _from?: string;
  _resolved?: string;
  _integrity?: string;
  dist?: {
    integrity?: string;
    shasum?: string;
    tarball?: string;
  };
}

/**
 * Configuration options for needsPublish
 */
export interface NeedsPublishOptions {
  /**
   * Working directory containing package.json
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Pre-loaded package.json (optional optimization)
   */
  package?: PackageJson;

  /**
   * Registry URL override
   */
  registry?: string;

  /**
   * Whether to include optionalDependencies in comparison
   * @default true
   */
  includeOptionalDeps?: boolean;

  /**
   * Additional fields to treat as significant
   * @default []
   */
  additionalSignificantFields?: string[];

  /**
   * Fields to explicitly ignore even if normally significant
   * @default []
   */
  ignoreFields?: string[];

  /**
   * Skip file comparison, only compare package.json semantically
   * @default false
   */
  packageJsonOnly?: boolean;

  /**
   * Logging level
   * @default 'silent'
   */
  logLevel?: 'silent' | 'warn' | 'info' | 'debug';

  /**
   * Treat narrowed dependency ranges as equivalent (no publish needed).
   * When true: `*` → `^4.17.0` is considered equivalent (optimistic)
   * When false: `*` → `^4.17.0` triggers publish (conservative)
   * @default true
   */
  treatNarrowingAsEquivalent?: boolean;
}

/**
 * Result of needsPublish check
 */
export interface NeedsPublishResult {
  /**
   * Whether the package needs to be published
   */
  needsPublish: boolean;

  /**
   * Human-readable reason
   */
  reason: string;

  /**
   * Detailed breakdown of changes detected
   */
  changes?: ChangeDetail[];
}

/**
 * Detail about a specific change detected
 */
export interface ChangeDetail {
  type: 'version' | 'dependency' | 'field' | 'file' | 'first-publish';
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  significance: 'critical' | 'significant' | 'informational';
}

/**
 * Dependency change detail
 */
export interface DependencyChange {
  name: string;
  type: 'dependencies' | 'peerDependencies' | 'optionalDependencies' | 'bundledDependencies';
  action: 'added' | 'removed' | 'changed';
  oldSpec?: string;
  newSpec?: string;
  semanticChange: SemanticChange;
}

/**
 * Type of semantic change between version specifiers
 */
export type SemanticChange = 'none' | 'equivalent' | 'narrowed' | 'widened' | 'incompatible';

/**
 * Type of version specifier
 */
export type VersionSpecifierType =
  | 'exact' // 1.2.3
  | 'caret' // ^1.2.3
  | 'tilde' // ~1.2.3
  | 'range' // >=1.0.0 <2.0.0
  | 'x-range' // 1.x, 1.2.x, *
  | 'hyphen' // 1.2.3 - 2.3.4
  | 'or' // >=1.0.0 || >=2.0.0
  | 'git' // git+https://...
  | 'file' // file:../local
  | 'alias' // npm:package@version
  | 'workspace' // workspace:*, workspace:^
  | 'tag' // latest, next
  | 'url'; // http(s) URLs to tarballs

/**
 * Parsed version specifier
 */
export interface ParsedVersionSpecifier {
  type: VersionSpecifierType;
  raw: string;
  normalized: string;
  /** For git types */
  gitInfo?: {
    url: string;
    committish?: string;
    semverRange?: string;
  };
  /** For alias types */
  aliasTarget?: ParsedVersionSpecifier;
  /** For workspace protocol */
  workspaceRange?: string;
}

/**
 * Result of comparing two version specifiers
 */
export interface SpecifierComparison {
  equivalent: boolean;
  relation:
    | 'identical'
    | 'normalized-equal'
    | 'semantically-equal'
    | 'same-major-caret' // ^4.17.0 → ^4.18.0 (same major)
    | 'same-minor-tilde' // ~4.17.0 → ~4.17.5 (same minor)
    | 'narrowed'
    | 'widened'
    | 'partially-overlapping'
    | 'disjoint'
    | 'incompatible-types'
    | 'unknown-type';
  detail?: string;
}

/**
 * Options for comparing version specifiers
 */
export interface CompareSpecifierOptions {
  /** Directory context for file: specifiers */
  where?: string;
}

/**
 * Result of comparing package.json files
 */
export interface PackageJsonComparison {
  hasSignificantChanges: boolean;
  fieldChanges: FieldChange[];
  dependencyChanges: DependencyChange[];
  summary: string;
}

/**
 * Field change detail
 */
export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  significance: 'critical' | 'significant' | 'informational';
}

/**
 * Result of comparing dependencies
 */
export interface DependencyComparison {
  hasChanges: boolean;
  changes: DependencyChange[];
  significantChanges: DependencyChange[];
}

/**
 * Options for comparing dependencies
 */
export interface DependencyCompareOptions {
  includeOptionalDeps?: boolean;
  /** Treat narrowed ranges as equivalent @default true */
  treatNarrowingAsEquivalent?: boolean;
}

/**
 * Result of comparing package files
 */
export interface FileComparison {
  identical: boolean;
  fileChanges: FileChange[];
  packageJsonOnly: boolean;
}

/**
 * File change detail
 */
export interface FileChange {
  path: string;
  action: 'added' | 'removed' | 'modified';
}

/**
 * Options for comparing package.json
 */
export interface CompareOptions {
  includeOptionalDeps?: boolean;
  additionalSignificantFields?: string[];
  ignoreFields?: string[];
  /** Treat narrowed ranges as equivalent @default true */
  treatNarrowingAsEquivalent?: boolean;
}

/**
 * Logger interface
 */
export type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

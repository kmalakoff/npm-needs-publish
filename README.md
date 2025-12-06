# npm-needs-publish

Smart publish detection for npm packages - semantic package.json comparison with semver-aware dependency analysis.

## Problem

Traditional publish detection methods have limitations:

- **Hash comparison**: Any package.json change triggers publish (even irrelevant ones like `devDependencies`)
- **Version-only check**: Doesn't detect content changes when version stays the same
- **Git-based**: Requires tags, CI needs `fetch-depth: 0`

## Solution

`npm-needs-publish` provides intelligent publish detection by:

1. **Semantic package.json comparison** - Ignores irrelevant fields (`devDependencies`, `scripts`, metadata)
2. **Semver-aware dependency analysis** - Understands that `^1.2.3` → `^1.2.4` may be equivalent
3. **Dependency type awareness** - Only `dependencies` and `peerDependencies` affect consumers
4. **File-level comparison** - Detects actual code changes, not just metadata

## Installation

```bash
npm install npm-needs-publish
```

## CLI Usage

```bash
# Check if current directory needs publishing
npm-needs-publish

# Check with JSON output
npm-needs-publish --json

# Check specific directory with verbose output
npm-needs-publish --cwd ./packages/my-package --verbose
```

### Options

| Option | Description |
|--------|-------------|
| `--cwd <path>` | Working directory (default: current directory) |
| `--registry <url>` | Registry URL override |
| `--json` | Output result as JSON |
| `--verbose, -v` | Show detailed change breakdown |
| `--package-json-only` | Only compare package.json, skip file comparison |
| `--no-optional-deps` | Exclude optionalDependencies from comparison |

### Exit Codes

- `0` - Package does NOT need publishing
- `1` - Package NEEDS publishing
- `2` - Error occurred

## Programmatic Usage

```typescript
import { needsPublish } from 'npm-needs-publish';

const result = await needsPublish({ cwd: process.cwd() });

if (result.needsPublish) {
  console.log('Publish needed:', result.reason);
  // Proceed with npm publish
} else {
  console.log('No publish needed:', result.reason);
}
```

### Options

```typescript
interface NeedsPublishOptions {
  cwd?: string;                        // Working directory
  package?: PackageJson;               // Pre-loaded package.json
  registry?: string;                   // Registry URL override
  includeOptionalDeps?: boolean;       // Include optionalDependencies (default: true)
  additionalSignificantFields?: string[]; // Extra fields to consider significant
  ignoreFields?: string[];             // Fields to ignore
  packageJsonOnly?: boolean;           // Skip file comparison
  treatNarrowingAsEquivalent?: boolean; // Treat narrowed ranges as equivalent (default: true)
}
```

### Result

```typescript
interface NeedsPublishResult {
  needsPublish: boolean;
  reason: string;
  changes?: ChangeDetail[];
}
```

## Algorithm

1. **Fetch registry packument** → if E404, return `needsPublish=true` (first publish)
2. **Version check** → if different, return `needsPublish=true` (intentional bump)
3. **Fast hash check** → if identical, return `needsPublish=false` (no changes)
4. **Extract both tarballs, compare file-by-file** (excluding package.json)
5. **If non-package.json files differ** → return `needsPublish=true`
6. **If only package.json differs** → do semantic comparison:
   - Compare significant fields only (`main`, `exports`, `bin`, `types`, etc.)
   - Compare dependencies with semver-aware logic
   - Ignore `devDependencies`, `scripts`, metadata fields
   - Return based on whether changes affect consumers

For a detailed explanation with flow diagrams, see [ALGORITHM.md](./ALGORITHM.md).

## Significant vs Non-Significant Fields

### Significant (affect consumers)

- `name`, `version`, `main`, `module`, `browser`, `exports`, `types`, `typings`, `type`
- `bin`, `files`, `engines`, `os`, `cpu`, `peerDependenciesMeta`, `packageManager`
- `dependencies`, `peerDependencies`, `optionalDependencies` (configurable), `bundledDependencies`

### Not Significant (metadata only)

- `devDependencies`, `scripts`
- `repository`, `homepage`, `bugs`, `author`, `contributors`
- `license`, `keywords`, `description`

## Semver Range Comparison

The tool understands semver range equivalence and is optimized for `npm update` / `ncu -u` workflows:

| Change | Triggers Publish? | Reason |
|--------|:-----------------:|--------|
| `^1.2.3` → `^1.2.3` | No | Identical |
| `^1.2.3` → `^1.2.4` | No | Same major (caret) |
| `^1.2.3` → `^1.5.0` | No | Same major (caret) |
| `^1.2.3` → `^2.0.0` | Yes | Different major |
| `~1.2.3` → `~1.2.4` | No | Same minor (tilde) |
| `~1.2.3` → `~1.3.0` | Yes | Different minor |
| `*` → `^4.17.0` | No* | Narrowed (optimistic default) |
| `^4.17.0` → `*` | Yes | Widened |

*Set `treatNarrowingAsEquivalent: false` for conservative behavior where narrowing triggers publish.

## License

MIT

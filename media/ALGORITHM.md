# Publish Detection Algorithm

This document provides a detailed explanation of how `npm-needs-publish` determines whether a package needs to be published.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         needsPublish() Entry Point                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  Load local package   │
                          │      package.json     │
                          └───────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │   Is pkg.private?     │
                          └───────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ YES                     │ NO
                         ▼                         ▼
              ┌──────────────────┐    ┌───────────────────────┐
              │  needsPublish:   │    │  Fetch registry       │
              │     false        │    │  packument            │
              │  "Package is     │    └───────────────────────┘
              │   private"       │                │
              └──────────────────┘                ▼
                                      ┌───────────────────────┐
                                      │   E404 Not Found?     │
                                      └───────────────────────┘
                                                  │
                                     ┌────────────┴────────────┐
                                     │ YES                     │ NO
                                     ▼                         ▼
                          ┌──────────────────┐    ┌───────────────────────┐
                          │  needsPublish:   │    │  Compare versions     │
                          │     true         │    │  local vs registry    │
                          │  "First publish" │    └───────────────────────┘
                          └──────────────────┘                │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │  Versions different?      │
                                              └───────────────────────────┘
                                                              │
                                             ┌────────────────┴────────────┐
                                             │ YES                         │ NO
                                             ▼                             ▼
                                  ┌──────────────────┐      ┌───────────────────────┐
                                  │  needsPublish:   │      │  Fetch both tarballs  │
                                  │     true         │      │  (registry + local)   │
                                  │  "Version        │      └───────────────────────┘
                                  │   differs"       │                  │
                                  └──────────────────┘                  ▼
                                                            ┌───────────────────────┐
                                                            │  Compare SHA hashes   │
                                                            └───────────────────────┘
                                                                        │
                                                       ┌────────────────┴────────────┐
                                                       │ IDENTICAL                   │ DIFFERENT
                                                       ▼                             ▼
                                            ┌──────────────────┐      ┌───────────────────────┐
                                            │  needsPublish:   │      │  Extract & compare    │
                                            │     false        │      │  files in tarballs    │
                                            │  "No changes     │      └───────────────────────┘
                                            │   (hash match)"  │                  │
                                            └──────────────────┘                  ▼
                                                                  ┌───────────────────────────┐
                                                                  │  Files identical?         │
                                                                  └───────────────────────────┘
                                                                              │
                                                             ┌────────────────┴────────────────┐
                                                             │ YES                             │ NO
                                                             ▼                                 ▼
                                                  ┌──────────────────┐          ┌─────────────────────────┐
                                                  │  needsPublish:   │          │  Only package.json      │
                                                  │     false        │          │  changed?               │
                                                  │  "Tarball meta   │          └─────────────────────────┘
                                                  │   differs only"  │                      │
                                                  └──────────────────┘         ┌────────────┴────────────┐
                                                                               │ NO                      │ YES
                                                                               ▼                         ▼
                                                                    ┌──────────────────┐    ┌─────────────────────┐
                                                                    │  needsPublish:   │    │  SEMANTIC           │
                                                                    │     true         │    │  COMPARISON         │
                                                                    │  "Code files     │    │  (see below)        │
                                                                    │   changed"       │    └─────────────────────┘
                                                                    └──────────────────┘
```

## Semantic Package.json Comparison

When only `package.json` has changed, we perform semantic comparison to determine if the changes affect consumers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SEMANTIC PACKAGE.JSON COMPARISON                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
           ┌──────────────────────────┴──────────────────────────┐
           │                                                     │
           ▼                                                     ▼
┌─────────────────────────┐                        ┌─────────────────────────┐
│  FIELD COMPARISON       │                        │  DEPENDENCY COMPARISON  │
│                         │                        │                         │
│  Significant fields:    │                        │  Significant types:     │
│  - main, module         │                        │  - dependencies         │
│  - exports, types       │                        │  - peerDependencies     │
│  - bin, files           │                        │  - optionalDependencies │
│  - engines, os, cpu     │                        │  - bundledDependencies  │
│  - type, packageManager │                        │                         │
│                         │                        │  Ignored:               │
│  Ignored:               │                        │  - devDependencies      │
│  - scripts, repository  │                        │                         │
│  - author, description  │                        │                         │
│  - homepage, bugs, etc. │                        │                         │
└─────────────────────────┘                        └─────────────────────────┘
           │                                                     │
           ▼                                                     ▼
┌─────────────────────────┐                        ┌─────────────────────────┐
│  Any significant field  │                        │  VERSION SPECIFIER      │
│  changed?               │                        │  COMPARISON             │
│                         │                        │  (see below)            │
└─────────────────────────┘                        └─────────────────────────┘
           │                                                     │
           └──────────────────────────┬──────────────────────────┘
                                      ▼
                          ┌───────────────────────────┐
                          │  Any significant changes? │
                          └───────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ YES                     │ NO
                         ▼                         ▼
              ┌──────────────────┐    ┌──────────────────┐
              │  needsPublish:   │    │  needsPublish:   │
              │     true         │    │     false        │
              │  (with summary)  │    │  "Changes not    │
              └──────────────────┘    │   significant"   │
                                      └──────────────────┘
```

## Version Specifier Comparison

The most complex part of the algorithm is comparing dependency version specifiers to determine if a change is significant.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VERSION SPECIFIER COMPARISON                             │
│                    compareVersionSpecifiers(old, new)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  Identical strings?   │
                          │  "^4.17.0" = "^4.17.0"│
                          └───────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ YES                     │ NO
                         ▼                         ▼
              ┌──────────────────┐    ┌───────────────────────┐
              │  relation:       │    │  Parse both specs     │
              │  "identical"     │    │  (npa + semver)       │
              │  equivalent: YES │    └───────────────────────┘
              └──────────────────┘                │
                                                  ▼
                                      ┌───────────────────────┐
                                      │  Same category?       │
                                      │  (semver/git/file/    │
                                      │   tag/url/workspace)  │
                                      └───────────────────────┘
                                                  │
                                     ┌────────────┴────────────┐
                                     │ NO                      │ YES
                                     ▼                         ▼
                          ┌──────────────────┐    ┌───────────────────────┐
                          │  relation:       │    │  Both semver-based?   │
                          │  "incompatible-  │    └───────────────────────┘
                          │   types"         │                │
                          │  equivalent: NO  │   ┌────────────┴────────────┐
                          └──────────────────┘   │ NO                      │ YES
                                                 ▼                         ▼
                                      (git/file/tag/url        ┌───────────────────────┐
                                       specific comparison)    │  Normalize ranges     │
                                                               │  via semver.Range()   │
                                                               └───────────────────────┘
                                                                           │
                                                                           ▼
                                                               ┌───────────────────────┐
                                                               │  Normalized equal?    │
                                                               └───────────────────────┘
                                                                           │
                                                          ┌────────────────┴────────────┐
                                                          │ YES                         │ NO
                                                          ▼                             ▼
                                               ┌──────────────────┐      ┌───────────────────────┐
                                               │  relation:       │      │  SAME-FAMILY CHECK    │
                                               │  "normalized-    │      │  (caret/tilde)        │
                                               │   equal"         │      └───────────────────────┘
                                               │  equivalent: YES │                  │
                                               └──────────────────┘                  ▼
```

### Same-Family Check

This check allows `ncu -u` and `npm update` to update dependency versions without triggering unnecessary publishes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SAME-FAMILY CHECK                                   │
│              (Allows ncu -u updates without triggering publish)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────────┐
                          │  Both caret (^) ranges?   │
                          └───────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ YES                     │ NO
                         ▼                         ▼
              ┌───────────────────────┐  ┌───────────────────────────┐
              │  Same MAJOR version?  │  │  Both tilde (~) ranges?   │
              │  ^4.17.0 vs ^4.18.0   │  └───────────────────────────┘
              │  Major: 4 = 4 YES     │              │
              └───────────────────────┘   ┌──────────┴────────────┐
                         │                │ YES                   │ NO
            ┌────────────┴────────────┐   ▼                       ▼
            │ YES                     │ NO  ┌─────────────────┐   ┌──────────────┐
            ▼                         │  │Same MAJOR.MINOR? │   │   SUBSET     │
 ┌──────────────────┐                 │  │~4.17.0 vs ~4.17.5│   │   CHECK      │
 │  relation:       │                 │  │4.17 = 4.17 YES   │   └──────────────┘
 │  "same-major-    │                 │  └─────────────────┘
 │   caret"         │                 │          │
 │  equivalent: YES │                 │     ┌────┴────┐
 └──────────────────┘                 │     │YES     │NO
                                      │     ▼        ▼
                                      │  ┌────────┐  │
                                      │  │relation│  │
                                      │  │"same-  │  │
                                      │  │minor-  │  │
                                      │  │tilde"  │  │
                                      │  │equiv:  │  │
                                      │  │  YES   │  │
                                      │  └────────┘  │
                                      │              │
                                      └──────┬───────┘
                                             │
                                             ▼
```

**Same-Family Rules:**
- **Caret (`^`) ranges**: Same MAJOR version = equivalent
  - `^4.17.0` → `^4.17.21` (same major 4)
  - `^4.17.0` → `^4.18.0` (same major 4)
- **Tilde (`~`) ranges**: Same MAJOR.MINOR version = equivalent
  - `~4.17.0` → `~4.17.5` (same minor 4.17)

### Subset Check

For ranges that don't match same-family rules, we use semver subset analysis.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUBSET CHECK                                      │
│                    (For ranges that aren't same-family)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────────┐
                          │  semver.subset(new, old)  │
                          │  AND                      │
                          │  semver.subset(old, new)  │
                          └───────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  BOTH TRUE      │    │  new ⊆ old      │    │  old ⊆ new      │
    │  (mutual        │    │  (only)         │    │  (only)         │
    │   subset)       │    │                 │    │                 │
    └─────────────────┘    └─────────────────┘    └─────────────────┘
              │                       │                       │
              ▼                       ▼                       ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  relation:      │    │  relation:      │    │  relation:      │
    │  "semantically- │    │  "narrowed"     │    │  "widened"      │
    │   equal"        │    │                 │    │                 │
    │  equivalent:YES │    │  Example:       │    │  Example:       │
    └─────────────────┘    │  * → ^4.17.0    │    │  ^4.17.0 → *    │
                           └─────────────────┘    └─────────────────┘
                                      │                       │
                                      ▼                       ▼
```

### Semantic Change Mapping

The final step maps the comparison result to a semantic change that determines if publish is needed.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SEMANTIC CHANGE MAPPING                                  │
│                    comparisonToSemanticChange()                             │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐         ┌─────────────────┐
                    │  "narrowed"     │         │  "widened"      │
                    │  * → ^4.17.0    │         │  ^4.17.0 → *    │
                    └─────────────────┘         └─────────────────┘
                              │                           │
                              ▼                           ▼
                   ┌─────────────────────┐     ┌─────────────────────┐
                   │  treatNarrowing     │     │  ALWAYS triggers    │
                   │  AsEquivalent       │     │  publish            │
                   │  option             │     │                     │
                   └─────────────────────┘     │  semanticChange:    │
                              │                │  "widened"          │
                 ┌────────────┴────────────┐   └─────────────────────┘
                 │ true (default)   │ false│
                 ▼                         ▼
      ┌─────────────────┐       ┌─────────────────┐
      │  semanticChange:│       │  semanticChange:│
      │  "equivalent"   │       │  "narrowed"     │
      │                 │       │                 │
      │  NO publish     │       │  Triggers       │
      │  needed         │       │  publish        │
      └─────────────────┘       └─────────────────┘
       (optimistic)              (conservative)
       DEFAULT                   treatNarrowingAsEquivalent: false
```

### Disjoint/Overlapping Check

When neither range is a subset of the other:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NEITHER SUBSET (disjoint or overlapping)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  rangeA.intersects    │
                          │  (rangeB)?            │
                          └───────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ YES                     │ NO
                         ▼                         ▼
              ┌──────────────────┐    ┌──────────────────┐
              │  relation:       │    │  relation:       │
              │  "partially-     │    │  "disjoint"      │
              │   overlapping"   │    │                  │
              │                  │    │  Example:        │
              │  Triggers        │    │  ^1.0.0 → ^2.0.0 │
              │  publish         │    │                  │
              └──────────────────┘    │  Triggers        │
                                      │  publish         │
                                      └──────────────────┘
```

## Quick Reference Table

| Scenario | Triggers Publish? | Reason |
|----------|:-----------------:|--------|
| Package is private | No | Skipped entirely |
| First publish (E404) | Yes | New package |
| Version differs | Yes | Intentional version bump |
| Tarball hash identical | No | No changes at all |
| Code files changed | Yes | Actual code change |
| Only metadata fields changed | No | `scripts`, `author`, etc. don't affect consumers |
| `^4.17.0` → `^4.17.21` | No | Same major version (caret) |
| `^4.17.0` → `^4.18.0` | No | Same major version (caret) |
| `~4.17.0` → `~4.17.5` | No | Same minor version (tilde) |
| `~4.17.0` → `~4.18.0` | Yes | Different minor version (tilde) |
| `^4.0.0` → `^5.0.0` | Yes | Different major version |
| `*` → `^4.17.0` | No* | Narrowed (optimistic default) |
| `^4.17.0` → `*` | Yes | Widened (always significant) |
| Dependency added | Yes | Structural change |
| Dependency removed | Yes | Structural change |

*With `treatNarrowingAsEquivalent: false`, narrowing will trigger publish.

## Configuration Options

### `treatNarrowingAsEquivalent`

Controls how narrowed dependency ranges are handled:

```typescript
// Optimistic (default): narrowing doesn't trigger publish
needsPublish({ treatNarrowingAsEquivalent: true });

// Conservative: narrowing triggers publish
needsPublish({ treatNarrowingAsEquivalent: false });
```

**When to use conservative mode:**
- You want explicit control over when dependencies are constrained
- Your consumers may be on older major versions that would be excluded
- You're migrating from `*` dependencies and want to intentionally publish

### `includeOptionalDeps`

Whether to include `optionalDependencies` in the comparison:

```typescript
// Include optional deps (default)
needsPublish({ includeOptionalDeps: true });

// Ignore optional deps
needsPublish({ includeOptionalDeps: false });
```

### `additionalSignificantFields` / `ignoreFields`

Customize which package.json fields are considered significant:

```typescript
needsPublish({
  additionalSignificantFields: ['customField'],
  ignoreFields: ['engines'], // Ignore engine constraints
});
```

// remove NODE_OPTIONS from ts-dev-stack
delete process.env.NODE_OPTIONS;

import assert from 'assert';
import { compareDependencies, type PackageJson } from 'npm-needs-publish';

describe('dependency', () => {
  describe('compareDependencies', () => {
    describe('added dependencies', () => {
      it('should detect added dependency', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: {},
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
        assert.equal(result.significantChanges.length, 1);
        assert.equal(result.significantChanges[0].name, 'lodash');
        assert.equal(result.significantChanges[0].action, 'added');
      });
    });

    describe('removed dependencies', () => {
      it('should detect removed dependency', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: {},
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
        assert.equal(result.significantChanges.length, 1);
        assert.equal(result.significantChanges[0].name, 'lodash');
        assert.equal(result.significantChanges[0].action, 'removed');
      });
    });

    describe('changed dependencies', () => {
      it('should detect changed dependency version', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^5.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
        assert.equal(result.significantChanges.length, 1);
        assert.equal(result.significantChanges[0].name, 'lodash');
        assert.equal(result.significantChanges[0].action, 'changed');
        assert.equal(result.significantChanges[0].semanticChange, 'incompatible');
      });

      it('should detect equivalent version changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, false);
        assert.equal(result.significantChanges.length, 0);
      });
    });

    describe('peerDependencies', () => {
      it('should detect peer dependency changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          peerDependencies: { react: '^18.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          peerDependencies: { react: '^17.0.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
        assert.equal(result.significantChanges.length, 1);
        assert.equal(result.significantChanges[0].type, 'peerDependencies');
      });
    });

    describe('optionalDependencies', () => {
      it('should detect optional dependency changes by default (major version change)', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          optionalDependencies: { fsevents: '^3.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          optionalDependencies: { fsevents: '^2.0.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
      });

      it('should treat same-major caret changes as equivalent', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          optionalDependencies: { fsevents: '^2.3.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          optionalDependencies: { fsevents: '^2.2.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, false);
      });

      it('should ignore optional dependencies when configured', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          optionalDependencies: { fsevents: '^3.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          optionalDependencies: { fsevents: '^2.0.0' },
        };

        const result = compareDependencies(local, registry, { includeOptionalDeps: false });
        assert.equal(result.hasChanges, false);
      });
    });

    describe('bundledDependencies', () => {
      it('should detect added bundled dependency', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          bundledDependencies: ['lodash'],
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          bundledDependencies: [],
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
        const bundledChange = result.significantChanges.find((c) => c.type === 'bundledDependencies');
        assert.ok(bundledChange);
        assert.equal(bundledChange.name, 'lodash');
        assert.equal(bundledChange.action, 'added');
      });

      it('should handle bundleDependencies spelling', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          bundleDependencies: ['lodash'],
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          bundleDependencies: [],
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, true);
      });
    });

    describe('no changes', () => {
      it('should return no changes for identical dependencies', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
          peerDependencies: { react: '^17.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.0.0' },
          peerDependencies: { react: '^17.0.0' },
        };

        const result = compareDependencies(local, registry);
        assert.equal(result.hasChanges, false);
        assert.equal(result.significantChanges.length, 0);
      });
    });

    describe('treatNarrowingAsEquivalent option', () => {
      it('should treat * → ^4.17.0 as equivalent by default (optimistic)', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.17.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '*' },
        };

        const result = compareDependencies(local, registry);
        // Default behavior: narrowing is equivalent, so no significant changes
        assert.equal(result.hasChanges, false);
        assert.equal(result.significantChanges.length, 0);
        // But the change is still recorded
        assert.equal(result.changes.length, 1);
        assert.equal(result.changes[0].semanticChange, 'equivalent');
      });

      it('should treat * → ^4.17.0 as significant when option is false (conservative)', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.17.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '*' },
        };

        const result = compareDependencies(local, registry, { treatNarrowingAsEquivalent: false });
        // Conservative behavior: narrowing is significant
        assert.equal(result.hasChanges, true);
        assert.equal(result.significantChanges.length, 1);
        assert.equal(result.significantChanges[0].semanticChange, 'narrowed');
      });

      it('should always treat widening as significant', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '*' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          dependencies: { lodash: '^4.17.0' },
        };

        // Widening is always significant regardless of option
        const result1 = compareDependencies(local, registry, { treatNarrowingAsEquivalent: true });
        assert.equal(result1.hasChanges, true);
        assert.equal(result1.significantChanges[0].semanticChange, 'widened');

        const result2 = compareDependencies(local, registry, { treatNarrowingAsEquivalent: false });
        assert.equal(result2.hasChanges, true);
        assert.equal(result2.significantChanges[0].semanticChange, 'widened');
      });
    });
  });
});

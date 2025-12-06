// remove NODE_OPTIONS from ts-dev-stack
delete process.env.NODE_OPTIONS;

import assert from 'assert';
import { comparePackageJson, type PackageJson } from 'npm-needs-publish';

describe('package-json', () => {
  describe('comparePackageJson', () => {
    describe('significant field changes', () => {
      it('should detect main field change', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          main: './dist/index.js',
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          main: './lib/index.js',
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
        assert.ok(result.fieldChanges.some((c) => c.field === 'main'));
      });

      it('should detect exports field change', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          exports: { '.': './dist/index.js' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          exports: { '.': './lib/index.js' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
        assert.ok(result.fieldChanges.some((c) => c.field === 'exports'));
      });

      it('should detect bin field change', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          bin: { cli: './bin/cli.js' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          bin: { cli: './bin/old-cli.js' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
        assert.ok(result.fieldChanges.some((c) => c.field === 'bin'));
      });

      it('should detect types field change', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          types: './dist/index.d.ts',
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          types: './lib/index.d.ts',
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
        assert.ok(result.fieldChanges.some((c) => c.field === 'types'));
      });

      it('should detect engines field change', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          engines: { node: '>=18' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          engines: { node: '>=16' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
        assert.ok(result.fieldChanges.some((c) => c.field === 'engines'));
      });
    });

    describe('non-significant field changes', () => {
      it('should ignore scripts changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          scripts: { test: 'jest' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          scripts: { test: 'mocha' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, false);
      });

      it('should ignore devDependencies changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          devDependencies: { jest: '^29.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          devDependencies: { jest: '^28.0.0' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, false);
      });

      it('should ignore repository changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          repository: { type: 'git', url: 'https://github.com/new/repo' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          repository: { type: 'git', url: 'https://github.com/old/repo' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, false);
      });

      it('should ignore author changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          author: 'New Author',
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          author: 'Old Author',
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, false);
      });

      it('should ignore description changes', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          description: 'New description',
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          description: 'Old description',
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, false);
      });
    });

    describe('dependency changes', () => {
      it('should detect dependency version changes', () => {
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

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
        assert.ok(result.dependencyChanges.length > 0);
      });

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

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, true);
      });
    });

    describe('custom options', () => {
      it('should respect additionalSignificantFields option', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          customField: 'new value',
        } as PackageJson;
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          customField: 'old value',
        } as PackageJson;

        const result = comparePackageJson(local, registry, {
          additionalSignificantFields: ['customField'],
        });
        assert.equal(result.hasSignificantChanges, true);
      });

      it('should respect ignoreFields option', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          main: './dist/index.js',
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          main: './lib/index.js',
        };

        const result = comparePackageJson(local, registry, {
          ignoreFields: ['main'],
        });
        assert.equal(result.hasSignificantChanges, false);
      });
    });

    describe('no changes', () => {
      it('should return no changes for identical package.json', () => {
        const local: PackageJson = {
          name: 'test',
          version: '1.0.0',
          main: './dist/index.js',
          dependencies: { lodash: '^4.0.0' },
        };
        const registry: PackageJson = {
          name: 'test',
          version: '1.0.0',
          main: './dist/index.js',
          dependencies: { lodash: '^4.0.0' },
        };

        const result = comparePackageJson(local, registry);
        assert.equal(result.hasSignificantChanges, false);
      });
    });
  });
});

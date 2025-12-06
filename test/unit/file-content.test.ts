import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import { extractPackageJson } from 'npm-needs-publish';
import os from 'os';
import path from 'path';

describe('file-content', () => {
  describe('extractPackageJson', () => {
    it('should extract package.json from a tarball', async () => {
      // Create a temp directory with a minimal package
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-needs-publish-test-'));
      const pkgJson = {
        name: 'test-pkg',
        version: '1.0.0',
        main: './index.js',
        files: ['index.js'],
        devDependencies: { mocha: '^10.0.0' },
      };

      try {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        fs.writeFileSync(path.join(tmpDir, 'index.js'), 'module.exports = {}');

        // Pack the package
        execSync('npm pack', { cwd: tmpDir, stdio: 'pipe' });
        const tarballPath = path.join(tmpDir, 'test-pkg-1.0.0.tgz');
        const tarball = fs.readFileSync(tarballPath);

        // Extract and verify
        const extracted = (await extractPackageJson(tarball)) as Record<string, unknown>;
        assert.equal(extracted.name, 'test-pkg');
        assert.equal(extracted.version, '1.0.0');
        assert.equal(extracted.main, './index.js');
        assert.deepEqual(extracted.files, ['index.js']);
        assert.deepEqual(extracted.devDependencies, { mocha: '^10.0.0' });
      } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should preserve all package.json fields including files', async () => {
      // This test verifies the fix for comparing tarball package.json
      // instead of packument (which is missing fields like 'files')
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-needs-publish-test-'));
      const pkgJson = {
        name: 'test-pkg-fields',
        version: '1.0.0',
        main: 'dist/cjs/index.js',
        type: 'module',
        exports: {
          '.': {
            import: './dist/esm/index.js',
            require: './dist/cjs/index.js',
          },
        },
        types: 'dist/cjs/index.d.ts',
        files: ['dist'],
        scripts: { test: 'mocha' },
        devDependencies: { typescript: '^5.0.0' },
      };

      try {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        fs.mkdirSync(path.join(tmpDir, 'dist'));
        fs.writeFileSync(path.join(tmpDir, 'dist', 'index.js'), '');

        execSync('npm pack', { cwd: tmpDir, stdio: 'pipe' });
        const tarballPath = path.join(tmpDir, 'test-pkg-fields-1.0.0.tgz');
        const tarball = fs.readFileSync(tarballPath);

        const extracted = (await extractPackageJson(tarball)) as Record<string, unknown>;

        // All these fields should be preserved (unlike packument which drops 'files')
        assert.equal(extracted.main, 'dist/cjs/index.js');
        assert.equal(extracted.type, 'module');
        assert.deepEqual(extracted.exports, pkgJson.exports);
        assert.equal(extracted.types, 'dist/cjs/index.d.ts');
        assert.deepEqual(extracted.files, ['dist']);
        assert.deepEqual(extracted.scripts, { test: 'mocha' });
        assert.deepEqual(extracted.devDependencies, { typescript: '^5.0.0' });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

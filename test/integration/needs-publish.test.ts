// Live integration tests require access to the configured npm registry.
import assert from 'assert';
import spawn from 'cross-spawn-cb';
import fs from 'fs';
import { needsPublish } from 'npm-needs-publish';
import path from 'path';
import semver from 'semver';
import { cleanupTempDir, createTempDir } from '../lib/test-helpers.ts';

const PACKAGES = ['parser-multipart'];

function addTests(packageName: string) {
  describe(packageName, () => {
    let tempDir: string;
    let dest: string;
    let originalPackageJson: string;
    let contentPath: string;
    let originalContent: string;

    before(async () => {
      tempDir = createTempDir('needs-publish-integration-');
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'needs-publish-integration', version: '1.0.0', private: true }));
      const env = { ...process.env };
      delete env.npm_config_allow_scripts;
      await new Promise<void>((resolve, reject) => {
        spawn('npm', ['install', '--ignore-scripts', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', `${packageName}@latest`], { cwd: tempDir, env, encoding: 'utf8' }, (err) => (err ? reject(err) : resolve()));
      });
      dest = path.join(tempDir, 'node_modules', packageName);
      originalPackageJson = fs.readFileSync(path.join(dest, 'package.json'), 'utf8');
      const pkg = JSON.parse(originalPackageJson);
      contentPath = path.join(dest, pkg.main);
      originalContent = fs.readFileSync(contentPath, 'utf8');
    });

    after(() => {
      if (tempDir) cleanupTempDir(tempDir);
    });

    afterEach(() => {
      fs.writeFileSync(path.join(dest, 'package.json'), originalPackageJson);
      fs.writeFileSync(contentPath, originalContent);
    });

    describe('Version comparison', () => {
      it('should need publish when local version newer than registry', async () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.version = semver.inc(pkg.version, 'major');
        fs.writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, true);
        assert.ok(result.reason.indexOf('Version differs') >= 0);
        assert.ok(result.reason.indexOf(pkg.version) >= 0);
      });

      it('should need publish when local version older than registry', async () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.version = '0.0.1';
        fs.writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, true);
        assert.ok(result.reason.indexOf('Version differs') >= 0);
        assert.ok(result.reason.indexOf('0.0.1') >= 0);
      });

      it('should proceed to integrity check when versions match', async () => {
        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, false, result.reason);
      });
    });

    describe('Integrity comparison', () => {
      it('should check hash when versions match', async () => {
        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, false, result.reason);
        assert.ok(result.reason.indexOf('No changes detected') >= 0 || result.reason.indexOf('identical') >= 0, result.reason);
      });

      it('should need publish when versions match but content differs', async () => {
        fs.appendFileSync(contentPath, '\n// Test modification to trigger hash difference\n');

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, true);
        assert.ok(
          result.changes?.some((change) => change.type === 'file' && change.field === `package/${path.relative(dest, contentPath).split(path.sep).join('/')}`),
          result.reason
        );
      });
    });

    describe('First publish detection', () => {
      it('should need publish for non-existent packages (E404)', async () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.name = `@test-npm-needs-publish/nonexistent-package-${Date.now()}`;
        fs.writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, true);
        assert.ok(result.reason.indexOf('Package not found') >= 0 || result.reason.indexOf('first publish') >= 0);
      });
    });

    describe('Private packages', () => {
      it('should skip private packages', async () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.private = true;
        fs.writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, false);
        assert.ok(result.reason.indexOf('private') >= 0);
      });
    });
  });
}

describe('needsPublish integration', () => {
  for (let i = 0; i < PACKAGES.length; i++) {
    addTests(PACKAGES[i]);
  }
});

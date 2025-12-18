import path from 'path';
import url from 'url';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));

import assert from 'assert';
import fs from 'fs';
import { linkModule, unlinkModule } from 'module-link-unlink';
import os from 'os';
import osShim from 'os-shim';
import Queue from 'queue-cb';
import * as resolve from 'resolve';
import shortHash from 'short-hash';
import { installGitRepo } from 'tsds-lib-test';

const tmpdir = os.tmpdir || osShim.tmpdir;
const resolveSync = (resolve.default ?? resolve).sync;

import { needsPublish } from 'npm-needs-publish';

const GITS = ['https://github.com/kmalakoff/parser-multipart.git'];

function addTests(repo: string) {
  const repoName = path.basename(repo, path.extname(repo));

  describe(repoName, () => {
    const dest = path.join(tmpdir(), 'npm-needs-publish', shortHash(process.cwd()), repoName);
    const modulePath = fs.realpathSync(path.join(__dirname, '..', '..'));
    const modulePackage = JSON.parse(fs.readFileSync(path.join(modulePath, 'package.json'), 'utf8'));
    const nodeModules = path.join(dest, 'node_modules');
    const deps = { ...(modulePackage.dependencies || {}), ...(modulePackage.peerDependencies || {}) };

    before((cb) => {
      installGitRepo(repo, dest, (err): void => {
        if (err) {
          cb(err);
          return;
        }

        const queue = new Queue();
        queue.defer(linkModule.bind(null, modulePath, nodeModules));
        for (const dep in deps) queue.defer(linkModule.bind(null, path.dirname(resolveSync(`${dep}/package.json`)), nodeModules));
        queue.await(cb);
      });
    });

    after((cb) => {
      const queue = new Queue();
      queue.defer(unlinkModule.bind(null, modulePath, nodeModules));
      for (const dep in deps) queue.defer(unlinkModule.bind(null, path.dirname(resolveSync(`${dep}/package.json`)), nodeModules));
      queue.await(cb);
    });

    // State restoration
    let originalPackageJson: string;
    let originalSrcFile: string | undefined;

    beforeEach(() => {
      originalPackageJson = fs.readFileSync(path.join(dest, 'package.json'), 'utf8');
      const srcPath = path.join(dest, 'src', 'index.js');
      if (fs.existsSync(srcPath)) {
        originalSrcFile = fs.readFileSync(srcPath, 'utf8');
      }
    });

    afterEach(() => {
      fs.writeFileSync(path.join(dest, 'package.json'), originalPackageJson);
      if (originalSrcFile) {
        const srcPath = path.join(dest, 'src', 'index.js');
        fs.writeFileSync(srcPath, originalSrcFile);
      }
    });

    describe('Version comparison', () => {
      it('should need publish when local version newer than registry', async () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.version = '99.99.99';
        fs.writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, true);
        assert.ok(result.reason.indexOf('Version differs') >= 0);
        assert.ok(result.reason.indexOf('99.99.99') >= 0);
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
        assert.ok(result.reason.indexOf('Version differs') < 0);
      });
    });

    describe('Integrity comparison', () => {
      it('should check hash when versions match', async () => {
        const result = await needsPublish({ cwd: dest });
        // Note: parser-multipart git clone may have changes not in registry
        if (result.needsPublish) {
          assert.ok(result.reason.indexOf('Code changes detected') >= 0 || result.reason.indexOf('Version differs') >= 0);
        } else {
          assert.ok(result.reason.indexOf('No changes detected') >= 0 || result.reason.indexOf('identical') >= 0);
        }
      });

      it('should need publish when versions match but content differs', async () => {
        const srcPath = path.join(dest, 'src', 'index.js');
        fs.appendFileSync(srcPath, '\n// Test modification to trigger hash difference\n');

        const result = await needsPublish({ cwd: dest });
        assert.equal(result.needsPublish, true);
        assert.ok(result.reason.indexOf('Code changes detected') >= 0 || result.reason.indexOf('changes') >= 0);
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
  for (let i = 0; i < GITS.length; i++) {
    addTests(GITS[i]);
  }
});

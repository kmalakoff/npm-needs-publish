import assert from 'assert';
import * as nnpStar from 'npm-needs-publish';
import { compareDependencies, comparePackageJson, compareVersionSpecifiers, comparisonToSemanticChange, extractPackageJson, needsPublish, needsPublishCb, parseVersionSpecifier } from 'npm-needs-publish';

describe('exports .ts', () => {
  it('named exports', () => {
    assert.equal(typeof needsPublish, 'function');
    assert.equal(typeof needsPublishCb, 'function');
    assert.equal(typeof compareDependencies, 'function');
    assert.equal(typeof comparePackageJson, 'function');
    assert.equal(typeof compareVersionSpecifiers, 'function');
    assert.equal(typeof comparisonToSemanticChange, 'function');
    assert.equal(typeof parseVersionSpecifier, 'function');
    assert.equal(typeof extractPackageJson, 'function');
  });

  it('star export', () => {
    assert.equal(typeof nnpStar.needsPublish, 'function');
    assert.equal(typeof nnpStar.needsPublishCb, 'function');
  });
});

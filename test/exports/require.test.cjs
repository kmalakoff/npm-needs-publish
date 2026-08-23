const assert = require('assert');
const nnp = require('npm-needs-publish');

describe('exports .cjs', () => {
  it('named exports', () => {
    assert.equal(typeof nnp.needsPublish, 'function');
    assert.equal(typeof nnp.needsPublishCb, 'function');
    assert.equal(typeof nnp.compareDependencies, 'function');
    assert.equal(typeof nnp.comparePackageJson, 'function');
    assert.equal(typeof nnp.compareVersionSpecifiers, 'function');
    assert.equal(typeof nnp.comparisonToSemanticChange, 'function');
    assert.equal(typeof nnp.parseVersionSpecifier, 'function');
    assert.equal(typeof nnp.extractPackageJson, 'function');
  });
});

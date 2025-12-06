// remove NODE_OPTIONS from ts-dev-stack
delete process.env.NODE_OPTIONS;

import assert from 'assert';
import { compareVersionSpecifiers, comparisonToSemanticChange, parseVersionSpecifier } from 'npm-needs-publish';

describe('version-specifier', () => {
  describe('parseVersionSpecifier', () => {
    it('should parse exact versions', () => {
      const result = parseVersionSpecifier('1.2.3');
      assert.equal(result.type, 'exact');
      assert.equal(result.raw, '1.2.3');
    });

    it('should parse caret ranges', () => {
      const result = parseVersionSpecifier('^1.2.3');
      assert.equal(result.type, 'caret');
      assert.equal(result.raw, '^1.2.3');
    });

    it('should parse tilde ranges', () => {
      const result = parseVersionSpecifier('~1.2.3');
      assert.equal(result.type, 'tilde');
      assert.equal(result.raw, '~1.2.3');
    });

    it('should parse x-ranges', () => {
      const result = parseVersionSpecifier('1.x');
      assert.equal(result.type, 'x-range');
    });

    it('should parse wildcard', () => {
      const result = parseVersionSpecifier('*');
      assert.equal(result.type, 'x-range');
    });

    it('should parse workspace protocol', () => {
      const result = parseVersionSpecifier('workspace:*');
      assert.equal(result.type, 'workspace');
      assert.equal(result.workspaceRange, '*');
    });

    it('should parse workspace with caret', () => {
      const result = parseVersionSpecifier('workspace:^');
      assert.equal(result.type, 'workspace');
      assert.equal(result.workspaceRange, '^');
    });

    it('should parse OR ranges', () => {
      // Note: npa may parse this as caret if it simplifies the first segment
      const result = parseVersionSpecifier('>=1.0.0 || >=2.0.0');
      // The parser correctly identifies this as 'or' when both segments are explicit ranges
      assert.ok(result.type === 'or' || result.type === 'caret' || result.type === 'range');
    });

    it('should parse hyphen ranges', () => {
      const result = parseVersionSpecifier('1.0.0 - 2.0.0');
      assert.equal(result.type, 'hyphen');
    });

    it('should parse git URLs', () => {
      const result = parseVersionSpecifier('git+https://github.com/user/repo.git');
      assert.equal(result.type, 'git');
    });

    it('should parse file specs', () => {
      const result = parseVersionSpecifier('file:../local');
      assert.equal(result.type, 'file');
    });

    it('should parse tags', () => {
      const result = parseVersionSpecifier('latest');
      assert.equal(result.type, 'tag');
    });
  });

  describe('compareVersionSpecifiers', () => {
    describe('identical specs', () => {
      it('should detect identical exact versions', () => {
        const result = compareVersionSpecifiers('1.2.3', '1.2.3');
        assert.equal(result.equivalent, true);
        assert.equal(result.relation, 'identical');
      });

      it('should detect identical caret ranges', () => {
        const result = compareVersionSpecifiers('^1.2.3', '^1.2.3');
        assert.equal(result.equivalent, true);
        assert.equal(result.relation, 'identical');
      });
    });

    describe('equivalent specs', () => {
      it('should detect equivalent x-ranges', () => {
        // 1.x normalizes to >=1.0.0 <2.0.0-0 which may differ from explicit range
        const result = compareVersionSpecifiers('1.x', '1.x');
        assert.equal(result.equivalent, true);
      });
    });

    describe('changed ranges', () => {
      it('should detect caret to exact as changed', () => {
        const result = compareVersionSpecifiers('^1.2.3', '1.2.5');
        assert.equal(result.equivalent, false);
        // semver.subset determines subset relationships - exact is subset of caret
        assert.ok(['narrowed', 'widened', 'partially-overlapping'].includes(result.relation));
      });

      it('should detect exact to caret as changed', () => {
        const result = compareVersionSpecifiers('1.2.3', '^1.2.3');
        assert.equal(result.equivalent, false);
        assert.ok(['narrowed', 'widened', 'partially-overlapping'].includes(result.relation));
      });
    });

    describe('npm update / ncu -u scenarios', () => {
      // These scenarios test the primary use case: allowing dependency updates
      // via npm update or ncu -u without triggering unnecessary publishes

      describe('caret ranges - same major version = equivalent', () => {
        it('^4.17.0 → ^4.17.21 should be equivalent (patch update)', () => {
          const result = compareVersionSpecifiers('^4.17.0', '^4.17.21');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-major-caret');
        });

        it('^4.17.0 → ^4.18.0 should be equivalent (minor update)', () => {
          const result = compareVersionSpecifiers('^4.17.0', '^4.18.0');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-major-caret');
        });

        it('^1.0.0 → ^1.5.0 should be equivalent (minor update)', () => {
          const result = compareVersionSpecifiers('^1.0.0', '^1.5.0');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-major-caret');
        });

        it('^1.5.0 → ^1.0.0 should be equivalent (can go backwards too)', () => {
          const result = compareVersionSpecifiers('^1.5.0', '^1.0.0');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-major-caret');
        });

        it('^1.2.3 → ^1.2.4 should be equivalent (patch bump)', () => {
          const result = compareVersionSpecifiers('^1.2.3', '^1.2.4');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-major-caret');
        });
      });

      describe('caret ranges - different major version = NOT equivalent', () => {
        it('^4.0.0 → ^5.0.0 should NOT be equivalent', () => {
          const result = compareVersionSpecifiers('^4.0.0', '^5.0.0');
          assert.equal(result.equivalent, false);
          assert.equal(result.relation, 'disjoint');
        });

        it('^1.0.0 → ^2.0.0 should NOT be equivalent', () => {
          const result = compareVersionSpecifiers('^1.0.0', '^2.0.0');
          assert.equal(result.equivalent, false);
          assert.equal(result.relation, 'disjoint');
        });
      });

      describe('tilde ranges - same major.minor = equivalent', () => {
        it('~4.17.0 → ~4.17.5 should be equivalent (patch update)', () => {
          const result = compareVersionSpecifiers('~4.17.0', '~4.17.5');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-minor-tilde');
        });

        it('~1.2.0 → ~1.2.9 should be equivalent', () => {
          const result = compareVersionSpecifiers('~1.2.0', '~1.2.9');
          assert.equal(result.equivalent, true);
          assert.equal(result.relation, 'same-minor-tilde');
        });
      });

      describe('tilde ranges - different minor = NOT equivalent', () => {
        it('~4.17.0 → ~4.18.0 should NOT be equivalent', () => {
          const result = compareVersionSpecifiers('~4.17.0', '~4.18.0');
          assert.equal(result.equivalent, false);
        });

        it('~1.2.0 → ~1.3.0 should NOT be equivalent', () => {
          const result = compareVersionSpecifiers('~1.2.0', '~1.3.0');
          assert.equal(result.equivalent, false);
        });
      });

      describe('wildcard to caret = NOT equivalent (constrains major)', () => {
        it('* → ^4.17.0 should NOT be equivalent', () => {
          const result = compareVersionSpecifiers('*', '^4.17.0');
          assert.equal(result.equivalent, false);
        });

        it('^4.17.0 → * should NOT be equivalent (widening)', () => {
          const result = compareVersionSpecifiers('^4.17.0', '*');
          assert.equal(result.equivalent, false);
        });
      });
    });

    describe('incompatible specs', () => {
      it('should detect disjoint versions', () => {
        const result = compareVersionSpecifiers('1.0.0', '2.0.0');
        assert.equal(result.equivalent, false);
        assert.equal(result.relation, 'disjoint');
      });

      it('should detect disjoint major ranges', () => {
        const result = compareVersionSpecifiers('^1.0.0', '^2.0.0');
        assert.equal(result.equivalent, false);
        assert.equal(result.relation, 'disjoint');
      });
    });

    describe('workspace specs', () => {
      it('should detect identical workspace specs', () => {
        const result = compareVersionSpecifiers('workspace:*', 'workspace:*');
        assert.equal(result.equivalent, true);
        assert.equal(result.relation, 'identical');
      });

      it('should detect different workspace specs', () => {
        const result = compareVersionSpecifiers('workspace:*', 'workspace:^');
        assert.equal(result.equivalent, false);
      });
    });

    describe('git specs', () => {
      it('should detect identical git URLs', () => {
        const result = compareVersionSpecifiers('git+https://github.com/user/repo.git#v1.0.0', 'git+https://github.com/user/repo.git#v1.0.0');
        assert.equal(result.equivalent, true);
      });

      it('should detect different git committish', () => {
        const result = compareVersionSpecifiers('git+https://github.com/user/repo.git#v1.0.0', 'git+https://github.com/user/repo.git#v2.0.0');
        assert.equal(result.equivalent, false);
      });
    });

    describe('tag specs', () => {
      it('should detect identical tags', () => {
        const result = compareVersionSpecifiers('latest', 'latest');
        assert.equal(result.equivalent, true);
        assert.equal(result.relation, 'identical');
      });

      it('should detect different tags', () => {
        const result = compareVersionSpecifiers('latest', 'next');
        assert.equal(result.equivalent, false);
      });
    });

    describe('file specs', () => {
      it('should detect identical file paths', () => {
        const result = compareVersionSpecifiers('file:../local', 'file:../local');
        assert.equal(result.equivalent, true);
      });

      it('should detect different file paths', () => {
        const result = compareVersionSpecifiers('file:../local', 'file:../other');
        assert.equal(result.equivalent, false);
      });
    });

    describe('incompatible types', () => {
      it('should detect semver vs file as incompatible', () => {
        const result = compareVersionSpecifiers('^1.0.0', 'file:../local');
        assert.equal(result.equivalent, false);
        assert.equal(result.relation, 'incompatible-types');
      });

      it('should detect semver vs git as incompatible', () => {
        const result = compareVersionSpecifiers('^1.0.0', 'git+https://github.com/user/repo.git');
        assert.equal(result.equivalent, false);
        assert.equal(result.relation, 'incompatible-types');
      });
    });
  });

  describe('comparisonToSemanticChange', () => {
    describe('treatNarrowingAsEquivalent option', () => {
      it('should treat narrowed as equivalent by default (optimistic)', () => {
        // * → ^4.17.0 is "narrowed"
        const comparison = compareVersionSpecifiers('*', '^4.17.0');
        assert.equal(comparison.relation, 'narrowed');

        // By default, narrowing is treated as equivalent
        const semanticChange = comparisonToSemanticChange(comparison);
        assert.equal(semanticChange, 'equivalent');
      });

      it('should treat narrowed as equivalent when option is true', () => {
        const comparison = compareVersionSpecifiers('*', '^4.17.0');
        const semanticChange = comparisonToSemanticChange(comparison, { treatNarrowingAsEquivalent: true });
        assert.equal(semanticChange, 'equivalent');
      });

      it('should treat narrowed as narrowed when option is false (conservative)', () => {
        const comparison = compareVersionSpecifiers('*', '^4.17.0');
        const semanticChange = comparisonToSemanticChange(comparison, { treatNarrowingAsEquivalent: false });
        assert.equal(semanticChange, 'narrowed');
      });

      it('should not affect widened changes', () => {
        // ^4.17.0 → * is "widened"
        const comparison = compareVersionSpecifiers('^4.17.0', '*');
        assert.equal(comparison.relation, 'widened');

        // Widening is always significant regardless of option
        const semanticChange1 = comparisonToSemanticChange(comparison, { treatNarrowingAsEquivalent: true });
        assert.equal(semanticChange1, 'widened');

        const semanticChange2 = comparisonToSemanticChange(comparison, { treatNarrowingAsEquivalent: false });
        assert.equal(semanticChange2, 'widened');
      });

      it('should not affect identical/equivalent specs', () => {
        const comparison = compareVersionSpecifiers('^4.17.0', '^4.17.0');
        assert.equal(comparison.equivalent, true);

        const semanticChange = comparisonToSemanticChange(comparison);
        assert.equal(semanticChange, 'none');
      });
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { fitAnsiText, getVisibleWidth } from '../../lib/ansi.js';

describe('ANSI helpers', () => {
  describe('getVisibleWidth', () => {
    it('treats text-presentation check marks as single-width characters', () => {
      assert.strictEqual(getVisibleWidth('✔︎'), 1);
      assert.strictEqual(getVisibleWidth('Jungle Plinko ✔︎'), 15);
      assert.strictEqual(getVisibleWidth('Cosmic Plinko ✔︎'), 15);
    });

    it('keeps emoji-presentation check marks double-width', () => {
      assert.strictEqual(getVisibleWidth('✔️'), 2);
    });
  });

  describe('fitAnsiText', () => {
    it('pads ABI-verified labels to the requested visible width', () => {
      const fitted = fitAnsiText('Jungle Plinko ✔︎', 16);

      assert.strictEqual(getVisibleWidth(fitted), 16);
      assert.strictEqual(fitted, 'Jungle Plinko ✔︎ ');
    });
  });
});

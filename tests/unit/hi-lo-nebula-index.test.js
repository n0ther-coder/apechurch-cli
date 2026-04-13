import { describe, it } from 'node:test';
import assert from 'node:assert';

import { resolveDecisionMode } from '../../lib/stateful/hi-lo-nebula/index.js';

describe('Hi-Lo Nebula manual suggestion mode', () => {
  it('shows no suggestion mode by default in manual play', () => {
    assert.strictEqual(resolveDecisionMode({ autoMode: null, autoPlay: false }), null);
    assert.strictEqual(resolveDecisionMode({ autoMode: 'simple', autoPlay: false }), null);
  });

  it('enables best suggestions only when solver mode is requested', () => {
    assert.strictEqual(resolveDecisionMode({ autoMode: null, autoPlay: false, solver: true }), 'best');
    assert.strictEqual(resolveDecisionMode({ autoMode: 'simple', autoPlay: false, solver: true }), 'best');
  });

  it('keeps the requested mode during auto-play', () => {
    assert.strictEqual(resolveDecisionMode({ autoMode: 'simple', autoPlay: true }), 'simple');
    assert.strictEqual(resolveDecisionMode({ autoMode: 'best', autoPlay: true }), 'best');
  });
});

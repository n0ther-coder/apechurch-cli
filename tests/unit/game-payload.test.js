import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveGamePayloadInputs } from '../../lib/games/base.js';

describe('Game payload overrides', () => {
  it('uses explicit expert payload overrides when provided', () => {
    const payload = resolveGamePayloadInputs({
      referral: null,
      xGameId: '0x2a',
      xRef: '0x0000000000000000000000000000000000000001',
      xUserRandomWord: '0x1111111111111111111111111111111111111111111111111111111111111111',
    });

    assert.deepStrictEqual(payload, {
      gameId: 42n,
      refAddress: '0x0000000000000000000000000000000000000001',
      userRandomWord: '0x1111111111111111111111111111111111111111111111111111111111111111',
    });
  });

  it('rejects malformed expert payload overrides', () => {
    assert.throws(
      () => resolveGamePayloadInputs({ xGameId: 'not-a-number' }),
      /--x-gameId must be a uint256/
    );
    assert.throws(
      () => resolveGamePayloadInputs({ xRef: '0x1234' }),
      /--x-ref must be a valid/
    );
    assert.throws(
      () => resolveGamePayloadInputs({ xUserRandomWord: '0x1234' }),
      /--x-userRandomWord must be a 0x-prefixed bytes32/
    );
  });
});

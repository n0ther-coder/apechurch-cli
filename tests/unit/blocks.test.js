import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters } from 'viem';
import {
  encodeBlocksGameData,
  getBlocksBoardSize,
  getBlocksGridLabel,
  getBlocksVrfGasLimit,
  parseBlocksGrid,
} from '../../lib/games/blocks.js';

const BLOCKS_GAME_DATA_TYPES = [
  { name: 'gameMode', type: 'uint8' },
  { name: 'riskMode', type: 'uint8' },
  { name: 'numRuns', type: 'uint8' },
  { name: 'compounding', type: 'bool' },
  { name: 'gameId', type: 'uint256' },
  { name: 'ref', type: 'address' },
  { name: 'userRandomWord', type: 'bytes32' },
];

describe('Blocks contract helpers', () => {
  it('accepts only explicit grid dimensions and defaults to 3x3', () => {
    assert.equal(parseBlocksGrid(undefined), 0);
    assert.equal(parseBlocksGrid('2x2'), 2);
    assert.equal(parseBlocksGrid('3X3'), 0);
    assert.equal(parseBlocksGrid('4x4'), 1);
    assert.throws(() => parseBlocksGrid('0'), /Numeric grid modes are not accepted/);
    assert.throws(() => parseBlocksGrid('3'), /grid must be one of/);
  });

  it('maps contract grid modes to dimensions and tile counts', () => {
    assert.equal(getBlocksGridLabel(0), '3x3');
    assert.equal(getBlocksGridLabel(1), '4x4');
    assert.equal(getBlocksGridLabel(2), '2x2');
    assert.equal(getBlocksBoardSize(0), 9);
    assert.equal(getBlocksBoardSize(1), 16);
    assert.equal(getBlocksBoardSize(2), 4);
  });

  it('scales VRF gas by runs times board tiles', () => {
    const gameEntry = { vrf: { baseGas: 600000, perTileGas: 25000 } };

    assert.equal(getBlocksVrfGasLimit(gameEntry, 2, 3), 900000);
    assert.equal(getBlocksVrfGasLimit(gameEntry, 0, 3), 1275000);
    assert.equal(getBlocksVrfGasLimit(gameEntry, 1, 3), 1800000);
  });

  it('encodes both compounding and independent contract payloads', () => {
    const shared = {
      gridMode: 1,
      riskMode: 0,
      numRuns: 3,
      gameId: 42n,
      refAddress: '0x0000000000000000000000000000000000000000',
      userRandomWord: `0x${'11'.repeat(32)}`,
    };
    const compounding = decodeAbiParameters(
      BLOCKS_GAME_DATA_TYPES,
      encodeBlocksGameData(shared),
    );
    const independent = decodeAbiParameters(
      BLOCKS_GAME_DATA_TYPES,
      encodeBlocksGameData({ ...shared, compounding: false }),
    );

    assert.deepStrictEqual(compounding, [
      1,
      0,
      3,
      true,
      42n,
      '0x0000000000000000000000000000000000000000',
      `0x${'11'.repeat(32)}`,
    ]);
    assert.equal(independent[3], false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { boxContent } from '../../lib/stateful/display.js';
import { getVisibleWidth } from '../../lib/ansi.js';

const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

describe('stateful display boxContent', () => {
  it('pads colored lines using visible width instead of raw ANSI length', () => {
    const output = boxContent([`  ${RED}DEALER WINS${RESET} ${DIM}(net profit -1.0000 APE)${RESET}`], '', 55);
    const contentLine = output[1];

    assert.strictEqual(getVisibleWidth(contentLine), 55);
    assert.match(contentLine, /║\s{2}\x1b\[31mDEALER WINS\x1b\[0m \x1b\[2m\(net profit -1\.0000 APE\)\x1b\[0m\s+║/);
  });

  it('closes ANSI styles when truncating a colored line to fit the box', () => {
    const output = boxContent([`${RED}${'X'.repeat(80)}${RESET}`], '', 20);
    const contentLine = output[1];

    assert.strictEqual(getVisibleWidth(contentLine), 20);
    assert.ok(contentLine.includes(RESET));
    assert.match(contentLine, /^║\x1b\[31mX{18}\x1b\[0m║$/);
  });

  it('counts emoji result lines at terminal width so the right border stays aligned', () => {
    const output = boxContent([`  ${RED}💀 DEALER WINS${RESET} ${DIM}(net profit -25.0000 APE)${RESET}`], '', 55);
    const contentLine = output[1];

    assert.strictEqual(getVisibleWidth(contentLine), 55);
    assert.match(contentLine, /^║  \x1b\[31m💀 DEALER WINS\x1b\[0m \x1b\[2m\(net profit -25\.0000 APE\)\x1b\[0m +║$/u);
  });
});

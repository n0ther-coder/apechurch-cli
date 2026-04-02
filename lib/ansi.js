/**
 * @fileoverview ANSI-aware text fitting helpers for terminal UI.
 *
 * These helpers preserve ANSI escape sequences while measuring, truncating,
 * and padding text to a target visible width.
 */

const ANSI_RESET = '\x1b[0m';
const ANSI_ESCAPE_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const ANSI_ESCAPE_PREFIX_REGEX = /^\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/;
const CONTROL_CHARACTER_REGEX = /[\u0000-\u001F\u007F-\u009F]/u;
const COMBINING_MARK_REGEX = /\p{Mark}/u;
const EMOJI_PRESENTATION_REGEX = /\p{Emoji_Presentation}/u;
const EMOJI_REGEX = /\p{Emoji}/u;
const REGIONAL_INDICATOR_REGEX = /\p{Regional_Indicator}/u;
const VARIATION_SELECTOR_REGEX = /[\uFE00-\uFE0F]/u;
const EMOJI_VARIATION_SELECTOR_REGEX = /\uFE0F/u;
const KEYCAP_REGEX = /\u20E3/u;
const ZERO_WIDTH_JOINER = 0x200D;

const graphemeSegmenter = typeof Intl?.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_ESCAPE_REGEX, '');
}

function iterateGraphemes(text) {
  const source = String(text ?? '');
  if (!source) {
    return [];
  }

  if (!graphemeSegmenter) {
    return Array.from(source);
  }

  return Array.from(graphemeSegmenter.segment(source), ({ segment }) => segment);
}

function isZeroWidthCodePoint(codePoint) {
  return codePoint === ZERO_WIDTH_JOINER
    || (codePoint >= 0xFE00 && codePoint <= 0xFE0F);
}

function isFullWidthCodePoint(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115F ||
    codePoint === 0x2329 ||
    codePoint === 0x232A ||
    (codePoint >= 0x2E80 && codePoint <= 0x3247 && codePoint !== 0x303F) ||
    (codePoint >= 0x3250 && codePoint <= 0x4DBF) ||
    (codePoint >= 0x4E00 && codePoint <= 0xA4C6) ||
    (codePoint >= 0xA960 && codePoint <= 0xA97C) ||
    (codePoint >= 0xAC00 && codePoint <= 0xD7A3) ||
    (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
    (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
    (codePoint >= 0xFE30 && codePoint <= 0xFE6B) ||
    (codePoint >= 0xFF01 && codePoint <= 0xFF60) ||
    (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
    (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF) ||
    (codePoint >= 0x1F300 && codePoint <= 0x1F64F) ||
    (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) ||
    (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
    (codePoint >= 0x1FA70 && codePoint <= 0x1FAFF) ||
    (codePoint >= 0x20000 && codePoint <= 0x3FFFD)
  );
}

function getGraphemeWidth(grapheme) {
  if (!grapheme || CONTROL_CHARACTER_REGEX.test(grapheme)) {
    return 0;
  }

  if (
    EMOJI_PRESENTATION_REGEX.test(grapheme) ||
    REGIONAL_INDICATOR_REGEX.test(grapheme) ||
    KEYCAP_REGEX.test(grapheme) ||
    grapheme.includes(String.fromCodePoint(ZERO_WIDTH_JOINER)) ||
    (EMOJI_VARIATION_SELECTOR_REGEX.test(grapheme) && EMOJI_REGEX.test(grapheme))
  ) {
    return 2;
  }

  let width = 0;
  for (const char of Array.from(grapheme)) {
    const codePoint = char.codePointAt(0);
    if (
      codePoint === undefined ||
      isZeroWidthCodePoint(codePoint) ||
      COMBINING_MARK_REGEX.test(char) ||
      VARIATION_SELECTOR_REGEX.test(char)
    ) {
      continue;
    }

    width += isFullWidthCodePoint(codePoint) ? 2 : 1;
  }

  return width;
}

export function getVisibleWidth(text) {
  return iterateGraphemes(stripAnsi(text))
    .reduce((width, grapheme) => width + getGraphemeWidth(grapheme), 0);
}

export function truncateAnsi(text, maxVisibleWidth) {
  const source = String(text ?? '');
  if (maxVisibleWidth <= 0 || source.length === 0) {
    return '';
  }

  let output = '';
  let visibleWidth = 0;
  let index = 0;

  while (index < source.length && visibleWidth < maxVisibleWidth) {
    const ansiMatch = source.slice(index).match(ANSI_ESCAPE_PREFIX_REGEX);
    if (ansiMatch) {
      output += ansiMatch[0];
      index += ansiMatch[0].length;
      continue;
    }

    const remaining = source.slice(index);
    const nextGrapheme = iterateGraphemes(remaining)[0];
    if (!nextGrapheme) {
      break;
    }

    const graphemeWidth = getGraphemeWidth(nextGrapheme);
    if (visibleWidth + graphemeWidth > maxVisibleWidth) {
      break;
    }

    output += nextGrapheme;
    visibleWidth += graphemeWidth;
    index += nextGrapheme.length;
  }

  if (index < source.length && source.includes('\x1b[') && !output.endsWith(ANSI_RESET)) {
    output += ANSI_RESET;
  }

  return output;
}

export function fitAnsiText(text, width) {
  const source = String(text ?? '');
  const fitted = getVisibleWidth(source) > width
    ? truncateAnsi(source, width)
    : source;
  const padding = Math.max(0, width - getVisibleWidth(fitted));
  return fitted + ' '.repeat(padding);
}

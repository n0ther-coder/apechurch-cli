/**
 * Terminal timestamp helpers.
 *
 * Human-facing timestamps intentionally mirror:
 *   date +%Y-%b-%d\ %H:%M:%S%z | tr [:lower:] [:upper:]
 *
 * Persisted JSON/log timestamps keep their existing ISO UTC representation.
 */

const MONTH_NAMES = Object.freeze([
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]);

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Format an instant for human-facing terminal output in local time, including
 * the numeric UTC offset. Returns null for invalid inputs.
 */
export function formatTerminalTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;

  return [
    `${date.getFullYear()}-${MONTH_NAMES[date.getMonth()]}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
      + `${offsetSign}${pad2(offsetHours)}${pad2(offsetRemainderMinutes)}`,
  ].join(' ');
}

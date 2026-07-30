/**
 * Utility functions for Unix timestamp and Date string conversions.
 */

/**
 * Detects whether a numeric value is likely in seconds or milliseconds.
 *
 * @param {number} num - The numeric timestamp.
 * @returns {'seconds' | 'milliseconds'} Detected unit.
 */
export function detectTimestampUnit(num) {
  // 3e10 seconds corresponds to Jan 24, 2920.
  // Values with absolute value > 3e10 are treated as milliseconds.
  return Math.abs(num) > 3e10 ? 'milliseconds' : 'seconds';
}

/**
 * Formats a Date object as an ISO 8601 string.
 *
 * @param {Date} date - Date object.
 * @returns {string} ISO 8601 representation.
 */
export function formatISO(date) {
  if (!date || isNaN(date.getTime())) return '';
  return date.toISOString();
}

/**
 * Formats a Date object as a UTC date string.
 *
 * @param {Date} date - Date object.
 * @returns {string} UTC date string.
 */
export function formatUTC(date) {
  if (!date || isNaN(date.getTime())) return '';
  return date.toUTCString();
}

/**
 * Formats a Date object in the browser local timezone.
 *
 * @param {Date} date - Date object.
 * @returns {string} Local date/time string.
 */
export function formatLocal(date) {
  if (!date || isNaN(date.getTime())) return '';
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Retrieves the local timezone identifier and offset.
 *
 * @param {Date} [date=new Date()] - Reference date for timezone offset.
 * @returns {string} Local timezone descriptor.
 */
export function getLocalTimezoneInfo(date = new Date()) {
  try {
    const resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const mins = String(absMinutes % 60).padStart(2, '0');
    return `${resolvedTz} (UTC${sign}${hours}:${mins})`;
  } catch {
    return 'Local Timezone';
  }
}

/**
 * Formats relative time between a target date and reference date.
 * Note: Months are approximated as 30 days and years as 365 days.
 *
 * @param {Date} date - Target date.
 * @param {Date} [now=new Date()] - Reference date.
 * @returns {string} Relative time text (e.g. "3 minutes ago", "2 hours from now").
 */
export function formatRelativeTime(date, now = new Date()) {
  if (!date || isNaN(date.getTime())) return '';

  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  const isFuture = diffMs > 0;

  if (absSec < 5) {
    return 'just now';
  }

  const suffix = isFuture ? ' from now' : ' ago';

  if (absSec < 60) {
    return `${absSec} ${absSec === 1 ? 'second' : 'seconds'}${suffix}`;
  }

  const absMin = Math.floor(absSec / 60);
  if (absMin < 60) {
    return `${absMin} ${absMin === 1 ? 'minute' : 'minutes'}${suffix}`;
  }

  const absHours = Math.floor(absMin / 60);
  if (absHours < 24) {
    return `${absHours} ${absHours === 1 ? 'hour' : 'hours'}${suffix}`;
  }

  const absDays = Math.floor(absHours / 24);
  if (absDays < 30) {
    return `${absDays} ${absDays === 1 ? 'day' : 'days'}${suffix}`;
  }

  const absMonths = Math.floor(absDays / 30);
  if (absMonths < 12) {
    return `${absMonths} ${absMonths === 1 ? 'month' : 'months'}${suffix}`;
  }

  const absYears = Math.floor(absDays / 365);
  return `${absYears} ${absYears === 1 ? 'year' : 'years'}${suffix}`;
}

/**
 * Converts a raw timestamp or date string into formatted output representations.
 *
 * @param {string|number} input - Input raw text or numeric timestamp.
 * @param {'auto'|'seconds'|'milliseconds'} [unitMode='auto'] - Timestamp unit mode.
 * @param {Date} [now=new Date()] - Reference date for relative time.
 * @returns {Object} Conversion result object.
 */
export function convertTimestamp(input, unitMode = 'auto', now = new Date()) {
  if (input === null || input === undefined || String(input).trim() === '') {
    return {
      isValid: true,
      isEmpty: true,
      inputType: null,
      detectedUnit: null,
      unixSeconds: '',
      unixMs: '',
      iso: '',
      utc: '',
      local: '',
      relative: '',
      timezone: getLocalTimezoneInfo(now),
    };
  }

  const trimmed = String(input).trim();
  const isNumeric = /^-?\d+(\.\d+)?$/.test(trimmed);

  let date;
  let detectedUnit = null;
  let inputType = '';

  if (isNumeric) {
    inputType = 'timestamp';
    const num = parseFloat(trimmed);

    if (unitMode === 'seconds') {
      detectedUnit = 'seconds';
    } else if (unitMode === 'milliseconds') {
      detectedUnit = 'milliseconds';
    } else {
      detectedUnit = detectTimestampUnit(num);
    }

    const ms = detectedUnit === 'seconds' ? num * 1000 : num;
    date = new Date(ms);
  } else {
    inputType = 'date-string';
    detectedUnit = 'date-string';
    date = new Date(trimmed);
  }

  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      isEmpty: false,
      error: inputType === 'timestamp'
        ? 'Invalid Unix timestamp number.'
        : 'Invalid date/time string format.',
      unixSeconds: '',
      unixMs: '',
      iso: '',
      utc: '',
      local: '',
      relative: '',
      timezone: getLocalTimezoneInfo(now),
    };
  }

  const msValue = date.getTime();
  const secValue = Math.floor(msValue / 1000);

  return {
    isValid: true,
    isEmpty: false,
    inputType,
    detectedUnit,
    unixSeconds: String(secValue),
    unixMs: String(msValue),
    iso: formatISO(date),
    utc: formatUTC(date),
    local: formatLocal(date),
    relative: formatRelativeTime(date, now),
    timezone: getLocalTimezoneInfo(date),
  };
}

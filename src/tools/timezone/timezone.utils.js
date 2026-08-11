/**
 * Default preset list of common IANA timezones.
 * @type {string[]}
 */
export const DEFAULT_PRESET_TIMEZONES = [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * Returns a sorted list of all supported IANA timezones.
 * Falls back to a curated list if Intl.supportedValuesOf is unsupported.
 *
 * @returns {string[]} List of supported timezone identifiers.
 */
export function getSupportedTimezones() {
  let zones = [];
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      zones = [...Intl.supportedValuesOf('timeZone')];
    } catch {
      // Fallback if supportedValuesOf throws
    }
  }

  if (!zones || zones.length === 0) {
    zones = [
      'UTC',
      'Africa/Cairo',
      'Africa/Johannesburg',
      'America/Argentina/Buenos_Aires',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/New_York',
      'America/Sao_Paulo',
      'America/Toronto',
      'Asia/Bangkok',
      'Asia/Dubai',
      'Asia/Hong_Kong',
      'Asia/Kolkata',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Europe/Amsterdam',
      'Europe/Berlin',
      'Europe/London',
      'Europe/Madrid',
      'Europe/Paris',
      'Europe/Rome',
      'Pacific/Auckland',
      'Pacific/Honolulu',
    ];
  }

  if (!zones.includes('UTC')) {
    zones.unshift('UTC');
  }

  return zones;
}

/**
 * Validates whether a given timezone string is supported by Intl.
 *
 * @param {string} timeZone - The timezone string to check.
 * @returns {boolean} True if timezone is valid, false otherwise.
 */
export function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts wall-clock date and time parts for a given Date in a timezone.
 *
 * @param {Date} date - UTC Date object.
 * @param {string} timeZone - IANA timezone identifier.
 * @returns {{year: number, month: number, day: number, hour: number,
 *   minute: number, second: number}}
 * Wall-clock numerical components.
 */
export function getWallTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type) => {
    const p = parts.find((item) => item.type === type);
    return p ? Number(p.value) : 0;
  };

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
  };
}

/**
 * Parses a date/time input string in a given timezone and converts it to a UTC Date object.
 *
 * @param {string} dateTimeStr - Date/time string (e.g. "2026-08-10T14:30" or "2026-08-10 14:30").
 * @param {string} sourceTimezone - IANA source timezone.
 * @returns {Date|null} Converted UTC Date object, or null if input is invalid.
 */
export function parseSourceToUtcDate(dateTimeStr, sourceTimezone) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string' || !isValidTimezone(sourceTimezone)) {
    return null;
  }

  const dtPattern = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const match = dateTimeStr.trim().match(dtPattern);
  if (!match) return null;

  const [, yrStr, moStr, dyStr, hrStr, miStr, seStr] = match;
  const year = Number(yrStr);
  const month = Number(moStr);
  const day = Number(dyStr);
  const hour = hrStr ? Number(hrStr) : 0;
  const minute = miStr ? Number(miStr) : 0;
  const second = seStr ? Number(seStr) : 0;

  const maxDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > maxDaysInMonth ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Converge to exact UTC timestamp for local wall time
  for (let i = 0; i < 3; i++) {
    const wall = getWallTimeParts(new Date(utcMs), sourceTimezone);
    const wallMs = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    );
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = targetMs - wallMs;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
}

/**
 * Calculates the UTC offset in minutes for a timezone at a specific Date.
 *
 * @param {Date} date - UTC Date instance.
 * @param {string} timeZone - IANA timezone identifier.
 * @returns {number} Offset in minutes (e.g. 540 for UTC+9, -240 for UTC-4).
 */
export function getUtcOffsetMinutes(date, timeZone) {
  const wall = getWallTimeParts(date, timeZone);
  const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const utcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );

  return Math.round((wallMs - utcMs) / 60000);
}

/**
 * Formats an offset in minutes into a standardized UTC string (e.g. "UTC+09:00").
 *
 * @param {number} offsetMinutes - Offset in minutes.
 * @returns {string} Formatted UTC offset string.
 */
export function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMins = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absMins / 60)).padStart(2, '0');
  const mins = String(absMins % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${mins}`;
}

/**
 * Calculates the calendar day difference between source and target date components.
 *
 * @param {{year: number, month: number, day: number}} sourceDay - Source date parts.
 * @param {{year: number, month: number, day: number}} targetDay - Target date parts.
 * @returns {number} Day difference integer (0, 1, -1, etc.).
 */
export function calculateDayDifference(sourceDay, targetDay) {
  const srcMs = Date.UTC(sourceDay.year, sourceDay.month - 1, sourceDay.day);
  const tgtMs = Date.UTC(targetDay.year, targetDay.month - 1, targetDay.day);
  return Math.round((tgtMs - srcMs) / 86400000);
}

/**
 * Returns a human-readable and accessible label for a day difference.
 *
 * @param {number} dayDiff - Numeric day difference.
 * @returns {string} Label such as "Same day", "+1 day", "-1 day".
 */
export function getDayDiffLabel(dayDiff) {
  if (dayDiff === 0) return 'Same day';
  if (dayDiff === 1) return '+1 day';
  if (dayDiff === -1) return '-1 day';
  if (dayDiff > 1) return `+${dayDiff} days`;
  return `${dayDiff} days`;
}

/**
 * Converts a source date/time in sourceTimezone to targetTimezone.
 *
 * @param {string} dateTimeStr - Source date/time string.
 * @param {string} sourceTimezone - Source IANA timezone.
 * @param {string} targetTimezone - Target IANA timezone.
 * @returns {object} Converted time details.
 */
export function convertTimezone(dateTimeStr, sourceTimezone, targetTimezone) {
  if (!isValidTimezone(sourceTimezone)) {
    return { isValid: false, error: `Invalid source timezone: ${sourceTimezone}` };
  }
  if (!isValidTimezone(targetTimezone)) {
    return { isValid: false, error: `Invalid target timezone: ${targetTimezone}` };
  }

  const utcDate = parseSourceToUtcDate(dateTimeStr, sourceTimezone);
  if (!utcDate) {
    return { isValid: false, error: 'Invalid date or time input format.' };
  }

  const sourceWall = getWallTimeParts(utcDate, sourceTimezone);
  const targetWall = getWallTimeParts(utcDate, targetTimezone);

  const offsetMinutes = getUtcOffsetMinutes(utcDate, targetTimezone);
  const offsetStr = formatUtcOffset(offsetMinutes);

  const dayDiff = calculateDayDifference(sourceWall, targetWall);
  const dayDiffLabel = getDayDiffLabel(dayDiff);

  const yr = String(targetWall.year).padStart(4, '0');
  const mo = String(targetWall.month).padStart(2, '0');
  const dy = String(targetWall.day).padStart(2, '0');
  const hr = String(targetWall.hour).padStart(2, '0');
  const mi = String(targetWall.minute).padStart(2, '0');
  const se = String(targetWall.second).padStart(2, '0');

  const localDate = `${yr}-${mo}-${dy}`;
  const localTime = `${hr}:${mi}:${se}`;
  const localDateTime = `${localDate} ${localTime}`;

  return {
    isValid: true,
    error: '',
    sourceTimezone,
    targetTimezone,
    utcDate,
    localDate,
    localTime,
    localDateTime,
    offsetMinutes,
    offsetStr,
    dayDiff,
    dayDiffLabel,
    isDifferentDay: dayDiff !== 0,
  };
}

/**
 * Resets/gets current date and time formatted for a given timezone.
 *
 * @param {string} timeZone - Target IANA timezone.
 * @param {Date} [now=new Date()] - Reference date object.
 * @returns {{dateStr: string, timeStr: string, dateTimeStr: string}} Formatted inputs.
 */
export function getNowInTimezone(timeZone, now = new Date()) {
  const wall = getWallTimeParts(now, isValidTimezone(timeZone) ? timeZone : 'UTC');
  const yr = String(wall.year).padStart(4, '0');
  const mo = String(wall.month).padStart(2, '0');
  const dy = String(wall.day).padStart(2, '0');
  const hr = String(wall.hour).padStart(2, '0');
  const mi = String(wall.minute).padStart(2, '0');

  const dateStr = `${yr}-${mo}-${dy}`;
  const timeStr = `${hr}:${mi}`;
  const dateTimeStr = `${dateStr}T${timeStr}`;

  return { dateStr, timeStr, dateTimeStr };
}

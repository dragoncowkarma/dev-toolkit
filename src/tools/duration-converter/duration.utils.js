export const CALENDAR_ASSUMPTIONS = Object.freeze({
  daysPerYear: 365,
  daysPerMonth: 30,
  daysPerWeek: 7,
});

const COMPONENT_KEYS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
const DATE_DESIGNATORS = ['Y', 'M', 'W', 'D'];
const TIME_DESIGNATORS = ['H', 'M', 'S'];
const DESIGNATOR_TO_KEY = {
  Y: 'years',
  M: 'months',
  W: 'weeks',
  D: 'days',
  H: 'hours',
  S: 'seconds',
};

function emptyComponents(sign = 1) {
  return { sign, years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function parseSection(text, designators, isTime) {
  const tokens = [];
  const expression = /(\d+(?:\.\d+)?)([A-Z])/g;
  let cursor = 0;
  let match = expression.exec(text);

  while (match) {
    if (match.index !== cursor) {
      return { error: 'Each duration component needs a numeric value and a valid designator.' };
    }
    if (!designators.includes(match[2])) {
      return { error: `The ${match[2]} designator is not valid in this part of a duration.` };
    }
    tokens.push({ value: Number(match[1]), designator: match[2], isTime });
    cursor = expression.lastIndex;
    match = expression.exec(text);
  }

  if (cursor !== text.length || tokens.some((token) => !Number.isFinite(token.value))) {
    return {
      error: 'Each duration component needs a finite numeric value and a valid designator.',
    };
  }

  const order = new Map(designators.map((designator, index) => [designator, index]));
  const isOrdered = tokens.every((token, index) => (
    index === 0 || order.get(tokens[index - 1].designator) < order.get(token.designator)
  ));
  if (!isOrdered) {
    return { error: 'Duration designators must use canonical order.' };
  }

  return { tokens };
}

function validateComponents(components) {
  if (!components || ![1, -1].includes(components.sign)) {
    throw new TypeError('Duration components need a sign of 1 or -1.');
  }
  COMPONENT_KEYS.forEach((key) => {
    if (!Number.isFinite(components[key]) || components[key] < 0) {
      throw new TypeError(`Duration component "${key}" must be a non-negative finite number.`);
    }
  });

  const lastNonZero = COMPONENT_KEYS.findLastIndex((key) => components[key] !== 0);
  const fractionalIndex = COMPONENT_KEYS.findIndex((key) => !Number.isInteger(components[key]));
  if (fractionalIndex >= 0 && fractionalIndex !== lastNonZero) {
    throw new TypeError('A fractional value is allowed only on the lowest-order component.');
  }
}

/**
 * Parses an ISO 8601 duration into normalized, non-negative components.
 *
 * @param {string} input - ISO 8601 duration text, optionally prefixed with `-`.
 * @returns {{isValid: boolean, error: string, components: object|null, canonical: string,
 *   usesCalendarApproximation: boolean}} A controlled parse result.
 */
export function parseDuration(input) {
  const fail = (error) => ({
    isValid: false,
    error,
    components: null,
    canonical: '',
    usesCalendarApproximation: false,
  });
  const normalized = String(input ?? '').trim().toUpperCase();
  if (!normalized) return fail('Enter an ISO 8601 duration starting with P.');
  if (!/^-?P/.test(normalized)) return fail('A duration must start with P or -P.');

  const sign = normalized.startsWith('-') ? -1 : 1;
  const body = normalized.slice(sign === -1 ? 2 : 1);
  if (!body) return fail('A duration cannot be a bare P.');
  if (body.split('T').length > 2) return fail('A duration can contain T only once.');

  const hasTimeSeparator = body.includes('T');
  const [dateText, timeText = ''] = body.split('T');
  if (hasTimeSeparator && !timeText) {
    return fail('The T separator must be followed by at least one time component.');
  }

  const dateResult = parseSection(dateText, DATE_DESIGNATORS, false);
  if (dateResult.error) return fail(dateResult.error);
  const timeResult = hasTimeSeparator
    ? parseSection(timeText, TIME_DESIGNATORS, true)
    : { tokens: [] };
  if (timeResult.error) return fail(timeResult.error);

  const tokens = [...dateResult.tokens, ...timeResult.tokens];
  if (!tokens.length) return fail('A duration needs at least one component.');
  if (tokens.some((token, index) => (
    !Number.isInteger(token.value) && index !== tokens.length - 1
  ))) {
    return fail('A fractional value is allowed only on the lowest-order component.');
  }

  const components = emptyComponents(sign);
  tokens.forEach((token) => {
    const key = token.designator === 'M'
      ? (token.isTime ? 'minutes' : 'months')
      : DESIGNATOR_TO_KEY[token.designator];
    components[key] = token.value;
  });
  const usesCalendarApproximation = dateResult.tokens.some((token) => (
    token.designator === 'Y' || token.designator === 'M'
  ));

  return {
    isValid: true,
    error: '',
    components,
    canonical: formatDuration(components),
    usesCalendarApproximation,
  };
}

/**
 * Converts duration components to seconds using 365-day years, 30-day months, and 7-day weeks.
 *
 * @param {object} components - Normalized duration components returned by {@link parseDuration}.
 * @returns {number} Signed total seconds under the documented calendar assumptions.
 */
export function durationToSeconds(components) {
  validateComponents(components);
  const days = (components.years * CALENDAR_ASSUMPTIONS.daysPerYear)
    + (components.months * CALENDAR_ASSUMPTIONS.daysPerMonth)
    + (components.weeks * CALENDAR_ASSUMPTIONS.daysPerWeek)
    + components.days;
  const seconds = (days * 86400) + (components.hours * 3600)
    + (components.minutes * 60) + components.seconds;
  return components.sign * seconds;
}

/**
 * Converts duration components to milliseconds using the same documented calendar assumptions.
 *
 * @param {object} components - Normalized duration components.
 * @returns {number} Signed total milliseconds.
 */
export function durationToMilliseconds(components) {
  return durationToSeconds(components) * 1000;
}

/**
 * Builds a canonical ISO 8601 duration from component values.
 *
 * @param {object} components - Components with a `sign` of 1 or -1.
 * @returns {string} Canonical ISO 8601 duration with zero components omitted.
 */
export function formatDuration(components) {
  validateComponents(components);
  if (COMPONENT_KEYS.every((key) => components[key] === 0)) return 'PT0S';
  const date = [
    [components.years, 'Y'],
    [components.months, 'M'],
    [components.weeks, 'W'],
    [components.days, 'D'],
  ].filter(([value]) => value !== 0)
    .map(([value, designator]) => `${formatNumber(value)}${designator}`);
  const time = [
    [components.hours, 'H'],
    [components.minutes, 'M'],
    [components.seconds, 'S'],
  ].filter(([value]) => value !== 0)
    .map(([value, designator]) => `${formatNumber(value)}${designator}`);
  const prefix = components.sign === -1 ? '-' : '';
  const timePart = time.length ? `T${time.join('')}` : '';
  return `${prefix}P${date.join('')}${timePart}`;
}

/**
 * Builds a canonical day/time ISO 8601 duration from total seconds.
 *
 * @param {number} totalSeconds - Finite signed total seconds.
 * @returns {string} Canonical ISO 8601 duration.
 */
export function formatDurationFromSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) throw new TypeError('Total seconds must be a finite number.');
  const sign = totalSeconds < 0 ? -1 : 1;
  let remaining = Math.abs(totalSeconds);
  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - (minutes * 60);
  return formatDuration({ sign, years: 0, months: 0, weeks: 0, days, hours, minutes, seconds });
}

/**
 * Formats components as a readable, localized-style English breakdown.
 *
 * @param {object} components - Normalized duration components.
 * @returns {string} Human-readable component list.
 */
export function formatHumanBreakdown(components) {
  validateComponents(components);
  const parts = COMPONENT_KEYS.filter((key) => components[key] !== 0).map((key) => {
    const label = key.slice(0, -1);
    const value = formatNumber(components[key]);
    return `${value} ${components[key] === 1 ? label : key}`;
  });
  const text = parts.length ? parts.join(', ') : '0 seconds';
  return components.sign === -1 && parts.length ? `-${text}` : text;
}

/**
 * Formats a duration as a signed HH:MM:SS clock, allowing hours beyond 24.
 *
 * @param {number} totalSeconds - Finite signed total seconds.
 * @returns {string} Compact clock representation.
 */
export function formatClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '';
  const sign = totalSeconds < 0 ? '-' : '';
  const absolute = Math.abs(totalSeconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute - (hours * 3600) - (minutes * 60);
  const secondsText = String(seconds).padStart(2, '0');
  const hoursText = String(hours).padStart(2, '0');
  const minutesText = String(minutes).padStart(2, '0');
  return `${sign}${hoursText}:${minutesText}:${secondsText}`;
}

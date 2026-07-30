const FIELD_DEFINITIONS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
  'Saturday'];

function invalidExpression(message) {
  throw new Error(`Invalid cron expression: ${message}`);
}

function parseNumber(value, definition) {
  if (!/^\d+$/.test(value)) invalidExpression(`${definition.name} contains "${value}".`);
  const number = Number(value);
  if (number < definition.min || number > definition.max) {
    invalidExpression(`${definition.name} must be between ${definition.min} and ${definition.max}.`);
  }
  return definition.name === 'day of week' && number === 7 ? 0 : number;
}

function parseField(source, definition) {
  const values = new Set();
  source.split(',').forEach((segment) => {
    const [rangeSource, stepSource] = segment.split('/');
    if (segment.split('/').length > 2 || (stepSource !== undefined && !/^\d+$/.test(stepSource))) {
      invalidExpression(`${definition.name} has an invalid step.`);
    }
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (step < 1) invalidExpression(`${definition.name} step must be at least 1.`);
    let start = definition.min;
    let end = definition.max;
    if (rangeSource !== '*') {
      const parts = rangeSource.split('-');
      if (parts.length === 1) start = end = parseNumber(parts[0], definition);
      else if (parts.length === 2) {
        start = parseNumber(parts[0], definition);
        end = parseNumber(parts[1], definition);
        if (start > end) invalidExpression(`${definition.name} range is reversed.`);
      } else invalidExpression(`${definition.name} has an invalid range.`);
    }
    for (let value = start; value <= end; value += step) values.add(value === 7 ? 0 : value);
  });
  return { source, values, wildcard: source === '*' };
}

/**
 * Parses a standard five-field or seconds-prefixed six-field cron expression.
 * @param {string} expression Cron expression.
 * @returns {{hasSeconds: boolean, second: object, fields: object[]}}
 */
export function parseCron(expression) {
  if (typeof expression !== 'string' || !expression.trim()) invalidExpression('enter an expression.');
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) invalidExpression('use 5 or 6 fields.');
  const hasSeconds = parts.length === 6;
  const second = hasSeconds
    ? parseField(parts.shift(), { name: 'second', min: 0, max: 59 })
    : { source: '0', values: new Set([0]), wildcard: false };
  return { hasSeconds, second, fields: parts.map((part, index) => parseField(part, FIELD_DEFINITIONS[index])) };
}

function formatValues(values, labels) {
  return [...values].sort((a, b) => a - b).map((value) => labels?.[value] ?? value).join(', ');
}

/**
 * Creates an English human-readable summary for a cron expression.
 * @param {string} expression Cron expression.
 * @returns {string} Description.
 */
export function describeCron(expression) {
  const cron = parseCron(expression);
  const [minute, hour, day, month, weekday] = cron.fields;
  if (cron.hasSeconds && cron.second.source.startsWith('*/') && minute.wildcard && hour.wildcard &&
    day.wildcard && month.wildcard && weekday.wildcard) return `Every ${cron.second.source.slice(2)} seconds`;
  if (minute.source.startsWith('*/') && hour.wildcard && day.wildcard && month.wildcard && weekday.wildcard) {
    return `Every ${minute.source.slice(2)} minutes`;
  }
  if (minute.wildcard && hour.wildcard && day.wildcard && month.wildcard && weekday.wildcard) return 'Every minute';
  const time = `at ${String(formatValues(hour.values)).padStart(2, '0')}:${String(formatValues(minute.values)).padStart(2, '0')}`;
  if (!weekday.wildcard && day.wildcard && month.wildcard) return `Every ${formatValues(weekday.values, WEEKDAY_NAMES)} ${time}`;
  if (!day.wildcard && month.wildcard && weekday.wildcard) return `On day ${formatValues(day.values)} of every month ${time}`;
  if (!month.wildcard && day.wildcard && weekday.wildcard) return `Every ${formatValues(month.values, MONTH_NAMES)} ${time}`;
  if (!hour.wildcard || !minute.wildcard) return `Every day ${time}`;
  return 'On the configured schedule';
}

function matches(date, cron) {
  const [minute, hour, day, month, weekday] = cron.fields;
  if (!cron.second.values.has(date.getSeconds()) || !minute.values.has(date.getMinutes()) ||
    !hour.values.has(date.getHours()) || !month.values.has(date.getMonth() + 1)) return false;
  const dayMatches = day.values.has(date.getDate());
  const weekdayMatches = weekday.values.has(date.getDay());
  return day.wildcard || weekday.wildcard ? dayMatches && weekdayMatches : dayMatches || weekdayMatches;
}

/**
 * Calculates future execution dates strictly after a reference point.
 * @param {string} expression Cron expression.
 * @param {Date} [from] Reference time.
 * @param {number} [count] Number of dates to return.
 * @returns {Date[]} Future executions.
 */
export function getNextExecutions(expression, from = new Date(), count = 5) {
  const cron = parseCron(expression);
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Count must be a positive integer.');
  const step = cron.hasSeconds ? 1000 : 60000;
  const candidate = new Date(from.getTime() + step);
  if (cron.hasSeconds) candidate.setMilliseconds(0);
  else candidate.setSeconds(0, 0);
  const executions = [];
  const limit = from.getTime() + 366 * 24 * 60 * 60 * 1000 * 5;
  while (candidate.getTime() <= limit && executions.length < count) {
    if (matches(candidate, cron)) executions.push(new Date(candidate));
    candidate.setTime(candidate.getTime() + step);
  }
  if (executions.length < count) throw new Error('Could not find enough executions within five years.');
  return executions;
}

/** Formats a date for a predictable local-language schedule list. */
export function formatExecution(date, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

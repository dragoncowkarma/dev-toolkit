/**
 * Unfolds RFC 5545 content lines while retaining the first physical line number.
 *
 * @param {string} source Raw iCalendar text.
 * @returns {{value: string, lineNumber: number}[]} Unfolded content lines.
 */
export function unfoldIcalendarLines(source) {
  const physicalLines = String(source).replace(/^\uFEFF/, '').split(/\r?\n/);
  const unfoldedLines = [];

  physicalLines.forEach((line, index) => {
    if (/^[ \t]/.test(line) && unfoldedLines.length > 0) {
      unfoldedLines.at(-1).value += line.slice(1);
      return;
    }
    unfoldedLines.push({ value: line, lineNumber: index + 1 });
  });

  return unfoldedLines;
}

function splitOutsideQuotes(value, delimiter) {
  const parts = [];
  let current = '';
  let quoted = false;

  for (const character of value) {
    if (character === '"') quoted = !quoted;
    if (character === delimiter && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function findOutsideQuotes(value, delimiter) {
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') quoted = !quoted;
    if (value[index] === delimiter && !quoted) return index;
  }

  return -1;
}

function decodeText(value) {
  return value.replace(/\\(?:n|N|,|;|\\)/g, (escape) => {
    const character = escape[1];
    return /n/i.test(character) ? '\n' : character;
  });
}

/**
 * Parses an unfolded iCalendar property into its name, parameters, and value.
 *
 * @param {string} line An unfolded iCalendar content line.
 * @param {number} lineNumber Source line number for diagnostics.
 * @returns {{
 *   name: string, params: Record<string, string>, value: string, raw: string, lineNumber: number
 * }|null}
 */
export function parseIcalendarProperty(line, lineNumber) {
  const colonIndex = findOutsideQuotes(line, ':');
  if (colonIndex < 1) return null;

  const headerParts = splitOutsideQuotes(line.slice(0, colonIndex), ';');
  const name = headerParts.shift().trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) return null;

  const params = {};
  headerParts.forEach((part) => {
    const equalsIndex = part.indexOf('=');
    if (equalsIndex < 1) return;
    const key = part.slice(0, equalsIndex).trim().toUpperCase();
    const parameterValue = part.slice(equalsIndex + 1).trim().replace(/^"|"$/g, '');
    if (key) params[key] = parameterValue;
  });

  return {
    name,
    params,
    value: line.slice(colonIndex + 1),
    raw: line,
    lineNumber,
  };
}

function datePartsAreValid(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

/**
 * Formats a DTSTART or DTEND property and reports malformed RFC 5545 values.
 *
 * @param {{value: string, params: Record<string, string>}} property Date property.
 * @returns {{display: string, error?: string}} A readable date value or validation error.
 */
export function decodeIcalendarDate(property) {
  const isDate = property.params.VALUE?.toUpperCase() === 'DATE';
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(property.value);
  if (isDate) {
    if (!dateMatch || !datePartsAreValid(...dateMatch.slice(1).map(Number))) {
      return { display: property.value, error: 'Expected a valid YYYYMMDD date.' };
    }
    const [, year, month, day] = dateMatch;
    return { display: `${year}-${month}-${day} (all day)` };
  }

  const dateTimeMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(property.value);
  if (!dateTimeMatch) {
    return { display: property.value, error: 'Expected a valid YYYYMMDDTHHMMSS date-time.' };
  }
  const [, year, month, day, hour, minute, second, utc] = dateTimeMatch;
  if (!datePartsAreValid(...[year, month, day, hour, minute, second].map(Number))) {
    return { display: property.value, error: 'Expected a valid calendar date and time.' };
  }
  const zone = utc ? ' UTC' : property.params.TZID ? ` (${property.params.TZID})` : '';
  return { display: `${year}-${month}-${day} ${hour}:${minute}:${second}${zone}` };
}

function makeError(lineNumber, message, line = '') {
  return { lineNumber, message, line };
}

function componentProperty(component, name) {
  return component.properties.find((property) => property.name === name);
}

function inspectComponent(component, errors) {
  if (component.name === 'VEVENT') {
    ['UID', 'DTSTAMP'].forEach((name) => {
      if (!componentProperty(component, name)) {
        errors.push(makeError(component.lineNumber, `VEVENT is missing required ${name}.`));
      }
    });
  }

  component.properties.forEach((property) => {
    if (property.name === 'DTSTART' || property.name === 'DTEND') {
      const decoded = decodeIcalendarDate(property);
      property.displayValue = decoded.display;
      if (decoded.error) {
        errors.push(
          makeError(property.lineNumber, `${property.name}: ${decoded.error}`, property.raw),
        );
      }
    } else if (['SUMMARY', 'UID', 'STATUS', 'RRULE'].includes(property.name)) {
      property.displayValue = decodeText(property.value);
    }
  });
  component.children.forEach((child) => inspectComponent(child, errors));
}

/**
 * Parses and validates iCalendar component nesting and selected common properties.
 *
 * @param {string} source Raw `.ics` text.
 * @returns {{components: object[], errors: {lineNumber: number, message: string, line: string}[]}}
 */
export function parseIcalendar(source) {
  const errors = [];
  const components = [];
  const stack = [];

  unfoldIcalendarLines(source).forEach(({ value, lineNumber }) => {
    if (value === '') return;
    const property = parseIcalendarProperty(value, lineNumber);
    if (!property) {
      errors.push(makeError(lineNumber, 'Malformed content line.', value));
      return;
    }
    if (property.name === 'BEGIN') {
      const component = {
        name: property.value.trim().toUpperCase(),
        lineNumber,
        properties: [],
        children: [],
      };
      if (!component.name) {
        errors.push(makeError(lineNumber, 'BEGIN has no component name.', value));
        return;
      }
      if (stack.length) stack.at(-1).children.push(component);
      else components.push(component);
      stack.push(component);
      return;
    }
    if (property.name === 'END') {
      const expected = stack.at(-1);
      const actual = property.value.trim().toUpperCase();
      if (!expected) {
        errors.push(makeError(lineNumber, `END:${actual} has no matching BEGIN.`, value));
      } else if (expected.name !== actual) {
        errors.push(
          makeError(lineNumber, `END:${actual} does not match BEGIN:${expected.name}.`, value),
        );
      } else {
        stack.pop();
      }
      return;
    }
    if (!stack.length) {
      errors.push(makeError(lineNumber, 'Property appears outside a component.', value));
      return;
    }
    stack.at(-1).properties.push(property);
  });

  stack.forEach((component) => {
    errors.push(makeError(component.lineNumber, `BEGIN:${component.name} has no matching END.`));
  });
  components.forEach((component) => inspectComponent(component, errors));
  return { components, errors };
}

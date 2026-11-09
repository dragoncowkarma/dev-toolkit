const DATE_PATTERN = /^\d{8}$/;
const DATE_TIME_PATTERN = /^\d{8}T\d{6}Z?$/;
const RRULE_FREQUENCIES = new Set([
  'SECONDLY',
  'MINUTELY',
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
]);

/**
 * Decodes RFC 5545 text escapes in a property value.
 * @param {string} value
 * @returns {string}
 */
export function decodeIcalendarText(value) {
  return value.replace(/\\([nN,;:\\])/g, (_, character) => {
    if (character === 'n' || character === 'N') return '\n';
    return character;
  });
}

/**
 * Unfolds iCalendar content lines continued by a leading space or tab.
 * @param {string} text
 * @returns {string[]}
 */
export function unfoldContentLines(text) {
  if (typeof text !== 'string') return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return lines.reduce((unfolded, line) => {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else if (line !== '') {
      unfolded.push(line);
    }
    return unfolded;
  }, []);
}

function splitOutsideQuotes(value, separator) {
  const parts = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      current += character;
      escaped = true;
    } else if (character === '"') {
      current += character;
      quoted = !quoted;
    } else if (character === separator && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function findValueDelimiter(line) {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === '"') quoted = !quoted;
    else if (character === ':' && !quoted) return index;
  }
  return -1;
}

function parseParameter(part) {
  const equalIndex = part.indexOf('=');
  if (equalIndex < 1) return null;
  const name = part.slice(0, equalIndex).toUpperCase();
  const rawValues = splitOutsideQuotes(part.slice(equalIndex + 1), ',');
  const values = rawValues.map((rawValue) => {
    const unquoted = rawValue.replace(/^"(.*)"$/, '$1');
    return decodeIcalendarText(unquoted);
  });
  return [name, values];
}

/**
 * Parses an unfolded RFC 5545 property line into its name, parameters, and value.
 * @param {string} line
 * @param {number} [lineNumber=0]
 * @returns {{name: string, params: Record<string, string[]>, value: string, line: number}|null}
 */
export function parseContentLine(line, lineNumber = 0) {
  const delimiter = findValueDelimiter(line);
  if (delimiter < 1) return null;
  const parts = splitOutsideQuotes(line.slice(0, delimiter), ';');
  const name = parts.shift()?.toUpperCase();
  if (!name || !/^[A-Z0-9-]+$/.test(name)) return null;
  const params = {};
  for (const part of parts) {
    const parameter = parseParameter(part);
    if (parameter) params[parameter[0]] = parameter[1];
  }
  return { name, params, value: decodeIcalendarText(line.slice(delimiter + 1)), line: lineNumber };
}

function createComponent(name, line) {
  return { name, line, properties: [], children: [] };
}

function addIssue(issues, severity, message, component, property) {
  issues.push({
    severity,
    message,
    component: component?.name ?? 'VCALENDAR',
    line: property?.line ?? component?.line ?? 0,
  });
}

function getProperties(component, name) {
  return component.properties.filter((property) => property.name === name);
}

function getProperty(component, name) {
  return getProperties(component, name)[0];
}

function validateDateProperty(component, property, issues) {
  const declaredDate = property.params.VALUE?.includes('DATE');
  const pattern = declaredDate ? DATE_PATTERN : DATE_TIME_PATTERN;
  if (!pattern.test(property.value)) {
    addIssue(
      issues,
      'error',
      `${property.name} must use a valid ${declaredDate ? 'DATE' : 'DATE-TIME'} value.`,
      component,
      property
    );
  }
  if (declaredDate && property.params.TZID) {
    addIssue(issues, 'warning', `${property.name} with VALUE=DATE should not use TZID.`, component, property);
  }
}

function validateRrule(component, property, issues) {
  const values = Object.fromEntries(
    property.value.split(';').filter(Boolean).map((part) => {
      const [name, value = ''] = part.split('=', 2);
      return [name.toUpperCase(), value];
    })
  );
  if (!values.FREQ || !RRULE_FREQUENCIES.has(values.FREQ)) {
    addIssue(issues, 'error', 'RRULE must include a valid FREQ value.', component, property);
  }
  if (values.INTERVAL && (!/^\d+$/.test(values.INTERVAL) || Number(values.INTERVAL) < 1)) {
    addIssue(issues, 'error', 'RRULE INTERVAL must be a positive integer.', component, property);
  }
  if (values.UNTIL && values.COUNT) {
    addIssue(issues, 'error', 'RRULE cannot include both UNTIL and COUNT.', component, property);
  }
  if (values.COUNT && (!/^\d+$/.test(values.COUNT) || Number(values.COUNT) < 1)) {
    addIssue(issues, 'error', 'RRULE COUNT must be a positive integer.', component, property);
  }
}

function validateComponent(component, issues) {
  const required = {
    VEVENT: ['UID', 'DTSTAMP', 'DTSTART'],
    VTODO: ['UID', 'DTSTAMP'],
    VALARM: ['ACTION', 'TRIGGER'],
  }[component.name] ?? [];
  for (const name of required) {
    if (!getProperty(component, name)) {
      addIssue(issues, 'error', `${component.name} is missing required ${name}.`, component);
    }
  }
  for (const name of ['DTSTART', 'DTEND']) {
    for (const property of getProperties(component, name)) {
      validateDateProperty(component, property, issues);
    }
  }
  for (const property of getProperties(component, 'RRULE')) {
    validateRrule(component, property, issues);
  }
  component.children.forEach((child) => validateComponent(child, issues));
}

/**
 * Parses and validates iCalendar text without sending data outside the browser.
 * @param {string} text
 * @returns {{calendar: object|null, events: object[], todos: object[], alarms: object[], issues: object[]}}
 */
export function parseIcalendar(text) {
  const issues = [];
  const stack = [];
  let calendar = null;
  unfoldContentLines(text).forEach((line, index) => {
    const property = parseContentLine(line, index + 1);
    if (!property) {
      addIssue(issues, 'error', 'Invalid content line.', null, { line: index + 1 });
      return;
    }
    if (property.name === 'BEGIN') {
      const component = createComponent(property.value.toUpperCase(), property.line);
      if (stack.length > 0) stack.at(-1).children.push(component);
      else if (component.name === 'VCALENDAR') calendar = component;
      else addIssue(issues, 'error', 'Calendar must begin with VCALENDAR.', component, property);
      stack.push(component);
    } else if (property.name === 'END') {
      const component = stack.pop();
      if (!component || component.name !== property.value.toUpperCase()) {
        addIssue(issues, 'error', `Unexpected END:${property.value}.`, component, property);
      } else {
        component.endLine = property.line;
      }
    } else if (stack.length > 0) {
      stack.at(-1).properties.push(property);
    } else {
      addIssue(issues, 'error', 'Property appears outside a component.', null, property);
    }
  });
  if (stack.length > 0) addIssue(issues, 'error', 'A component is not closed.', stack.at(-1));
  if (!calendar) addIssue(issues, 'error', 'Missing VCALENDAR component.');

  const components = calendar?.children ?? [];
  const events = components.filter((component) => component.name === 'VEVENT');
  const todos = components.filter((component) => component.name === 'VTODO');
  const alarms = components.flatMap((component) => component.children)
    .filter((component) => component.name === 'VALARM');
  components.forEach((component) => validateComponent(component, issues));
  const seenUids = new Map();
  events.forEach((event) => {
    const uid = getProperty(event, 'UID');
    if (uid && seenUids.has(uid.value)) {
      addIssue(issues, 'error', `Duplicate event UID: ${uid.value}.`, event, uid);
    } else if (uid) {
      seenUids.set(uid.value, event);
    }
  });
  return { calendar, events, todos, alarms, issues };
}

/**
 * Returns a human-readable property value for an event table.
 * @param {object} component
 * @param {string} name
 * @returns {string}
 */
export function getComponentValue(component, name) {
  return getProperty(component, name)?.value ?? '';
}

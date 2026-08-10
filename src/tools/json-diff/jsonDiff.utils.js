const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

function appendPath(path, key, isArray) {
  if (isArray) return `${path}[${key}]`;
  if (IDENTIFIER_PATTERN.test(key)) return `${path}.${key}`;
  return `${path}[${JSON.stringify(key)}]`;
}

function walk(originalValue, changedValue, path, changes) {
  if (Object.is(originalValue, changedValue)) return;

  const originalIsArray = Array.isArray(originalValue);
  const changedIsArray = Array.isArray(changedValue);
  if (originalIsArray && changedIsArray) {
    const sharedLength = Math.min(originalValue.length, changedValue.length);
    for (let index = 0; index < sharedLength; index += 1) {
      walk(originalValue[index], changedValue[index], appendPath(path, index, true), changes);
    }
    for (let index = sharedLength; index < originalValue.length; index += 1) {
      changes.push({
        path: appendPath(path, index, true),
        type: 'removed',
        oldValue: originalValue[index],
      });
    }
    for (let index = sharedLength; index < changedValue.length; index += 1) {
      changes.push({
        path: appendPath(path, index, true),
        type: 'added',
        newValue: changedValue[index],
      });
    }
    return;
  }

  if (isContainer(originalValue) && isContainer(changedValue)
    && !originalIsArray && !changedIsArray) {
    const keys = [...new Set([
      ...Object.keys(originalValue),
      ...Object.keys(changedValue),
    ])].sort();

    keys.forEach((key) => {
      const nextPath = appendPath(path, key, false);
      const hasOriginal = Object.hasOwn(originalValue, key);
      const hasChanged = Object.hasOwn(changedValue, key);
      if (!hasOriginal) {
        changes.push({ path: nextPath, type: 'added', newValue: changedValue[key] });
      } else if (!hasChanged) {
        changes.push({ path: nextPath, type: 'removed', oldValue: originalValue[key] });
      } else {
        walk(originalValue[key], changedValue[key], nextPath, changes);
      }
    });
    return;
  }

  changes.push({ path, type: 'changed', oldValue: originalValue, newValue: changedValue });
}

/**
 * Compares two parsed JSON values and returns deterministic, path-based change records.
 * Objects are compared by key and arrays are compared by index.
 *
 * @param {*} originalValue - The parsed value before the change.
 * @param {*} changedValue - The parsed value after the change.
 * @returns {Array<{path: string, type: string, oldValue?: *, newValue?: *}>} Changes.
 */
export function diffJson(originalValue, changedValue) {
  const changes = [];
  walk(originalValue, changedValue, '$', changes);
  return changes;
}

/**
 * Parses both JSON inputs and returns either changes or side-specific parse errors.
 *
 * @param {string} originalInput - Raw original JSON text.
 * @param {string} changedInput - Raw changed JSON text.
 * @returns {{ready: boolean, changes: Array, errors: Array<{side: string, message: string}>}}
 * Structured comparison result.
 */
export function compareJsonInputs(originalInput, changedInput) {
  if (!originalInput.trim() || !changedInput.trim()) {
    return { ready: false, changes: [], errors: [] };
  }

  const errors = [];
  let originalValue;
  let changedValue;

  try {
    originalValue = JSON.parse(originalInput);
  } catch (error) {
    errors.push({ side: 'original', message: error.message });
  }

  try {
    changedValue = JSON.parse(changedInput);
  } catch (error) {
    errors.push({ side: 'changed', message: error.message });
  }

  if (errors.length > 0) return { ready: false, changes: [], errors };
  return { ready: true, changes: diffJson(originalValue, changedValue), errors: [] };
}

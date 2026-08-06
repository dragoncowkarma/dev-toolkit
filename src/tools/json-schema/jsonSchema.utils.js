/**
 * Options for JSON Schema generation.
 * @typedef {Object} InferSchemaOptions
 * @property {'2020-12' | 'draft-07'} [draft='2020-12'] - JSON Schema draft version.
 * @property {'all' | 'none'} [requiredMode='all'] - Control required properties inclusion.
 * @property {boolean} [inferIntegers=false] - Infer integer type for whole numbers.
 * @property {boolean} [includeExamples=false] - Attach scalar values as leaf examples.
 * @property {string} [title] - Optional root schema title.
 */

const DRAFT_URIS = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

const KEY_ORDER = ['$schema', 'title', 'type', 'properties', 'required', 'items', 'anyOf'];

/**
 * Recursively orders keys in a schema object according to standard schema order.
 *
 * @param {*} obj - Schema or sub-schema object.
 * @param {boolean} [ignoreExamples=false] - Whether to exclude examples for shape comparison.
 * @returns {*} Copy of obj with ordered keys.
 */
function orderSchemaKeys(obj, ignoreExamples = false) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => orderSchemaKeys(item, ignoreExamples));
  }

  const result = {};
  const allKeys = Object.keys(obj);

  if (ignoreExamples) {
    const examplesIdx = allKeys.indexOf('examples');
    if (examplesIdx !== -1) {
      allKeys.splice(examplesIdx, 1);
    }
  }

  for (const key of KEY_ORDER) {
    if (allKeys.includes(key)) {
      if (key === 'properties' && obj.properties && typeof obj.properties === 'object') {
        const sortedPropKeys = Object.keys(obj.properties).sort();
        const orderedProps = {};
        for (const propKey of sortedPropKeys) {
          orderedProps[propKey] = orderSchemaKeys(obj.properties[propKey], ignoreExamples);
        }
        result.properties = orderedProps;
      } else {
        result[key] = orderSchemaKeys(obj[key], ignoreExamples);
      }
    }
  }

  const remainingKeys = allKeys
    .filter((key) => !KEY_ORDER.includes(key))
    .sort();

  for (const key of remainingKeys) {
    result[key] = orderSchemaKeys(obj[key], ignoreExamples);
  }

  return result;
}

/**
 * Returns a canonical shape key for schema deduplication.
 *
 * @param {Object} schema - Schema object.
 * @returns {string} Serialized shape key.
 */
function getShapeKey(schema) {
  const ordered = orderSchemaKeys(schema, true);
  return JSON.stringify(ordered);
}

/**
 * Deduplicates item schemas by preserving unique structural shapes.
 *
 * @param {Object[]} schemas - List of item schemas.
 * @returns {Object[]} Deduplicated item schemas.
 */
function deduplicateSchemas(schemas) {
  const seen = new Set();
  const result = [];

  for (const schema of schemas) {
    const key = getShapeKey(schema);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(schema);
    }
  }

  return result;
}

/**
 * Infers a JSON Schema object for a parsed JavaScript value.
 *
 * @param {*} value - Parsed JavaScript value.
 * @param {InferSchemaOptions} [options={}] - Inference options.
 * @param {boolean} [isRoot=true] - Whether this node is the root schema.
 * @returns {Object} Inferred JSON Schema object.
 */
export function inferSchema(value, options = {}, isRoot = true) {
  const {
    draft = '2020-12',
    requiredMode = 'all',
    inferIntegers = false,
    includeExamples = false,
    title,
  } = options;

  const schema = {};

  if (isRoot) {
    schema.$schema = DRAFT_URIS[draft] || DRAFT_URIS['2020-12'];

    if (typeof title === 'string' && title.trim().length > 0) {
      schema.title = title.trim();
    }
  }

  if (value === null) {
    schema.type = 'null';
    if (includeExamples) {
      schema.examples = [null];
    }
    return schema;
  }

  const valueType = typeof value;

  if (valueType === 'boolean') {
    schema.type = 'boolean';
    if (includeExamples) {
      schema.examples = [value];
    }
    return schema;
  }

  if (valueType === 'string') {
    schema.type = 'string';
    if (includeExamples) {
      schema.examples = [value];
    }
    return schema;
  }

  if (valueType === 'number') {
    schema.type = inferIntegers && Number.isInteger(value) ? 'integer' : 'number';
    if (includeExamples) {
      schema.examples = [value];
    }
    return schema;
  }

  if (Array.isArray(value)) {
    schema.type = 'array';
    if (value.length === 0) {
      return schema;
    }

    const itemSchemas = value.map((item) => inferSchema(item, options, false));
    const uniqueSchemas = deduplicateSchemas(itemSchemas);

    if (uniqueSchemas.length === 1) {
      schema.items = uniqueSchemas[0];
    } else {
      schema.items = { anyOf: uniqueSchemas };
    }
    return schema;
  }

  if (valueType === 'object') {
    schema.type = 'object';
    schema.properties = {};
    const keys = Object.keys(value);

    for (const key of keys) {
      schema.properties[key] = inferSchema(value[key], options, false);
    }

    if (requiredMode === 'all') {
      schema.required = [...keys];
    }
    return schema;
  }

  return schema;
}

/**
 * Parses a sample JSON string and infers its schema. Does not throw on invalid input.
 *
 * @param {string} jsonText - Sample JSON string payload.
 * @param {InferSchemaOptions} [options={}] - Inference configuration options.
 * @returns {{ schema: Object | null, error: string | null }} Schema inference result.
 */
export function generateSchema(jsonText, options = {}) {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    return { schema: null, error: 'JSON input is empty.' };
  }

  try {
    const parsed = JSON.parse(jsonText);
    const schema = inferSchema(parsed, options, true);
    return { schema, error: null };
  } catch (err) {
    return { schema: null, error: err.message || 'Invalid JSON syntax.' };
  }
}

/**
 * Pretty-prints a JSON Schema object with stable key ordering.
 *
 * @param {Object | null} schema - JSON Schema object.
 * @param {number | string} [indent=2] - Indentation level or spaces.
 * @returns {string} Formatted JSON Schema text.
 */
export function formatSchema(schema, indent = 2) {
  if (!schema || typeof schema !== 'object') {
    return '';
  }

  const ordered = orderSchemaKeys(schema, false);
  return JSON.stringify(ordered, null, indent);
}

/**
 * Calculates statistics for an inferred schema (object count, property count).
 *
 * @param {Object | null} schema - JSON Schema object.
 * @returns {{ objectCount: number, propertyCount: number }} Node statistics.
 */
export function getSchemaStats(schema) {
  let objectCount = 0;
  let propertyCount = 0;

  function traverse(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'object') {
      objectCount += 1;
      if (node.properties && typeof node.properties === 'object') {
        const keys = Object.keys(node.properties);
        propertyCount += keys.length;
        for (const key of keys) {
          traverse(node.properties[key]);
        }
      }
    } else if (node.type === 'array') {
      if (node.items) {
        if (Array.isArray(node.items.anyOf)) {
          for (const item of node.items.anyOf) {
            traverse(item);
          }
        } else {
          traverse(node.items);
        }
      }
    }
  }

  if (schema) {
    traverse(schema);
  }

  return { objectCount, propertyCount };
}

const PRIMITIVE_TYPES = new Set([
  'null',
  'boolean',
  'int',
  'long',
  'float',
  'double',
  'bytes',
  'string',
]);

const COMPLEX_TYPES = new Set(['record', 'enum', 'array', 'map', 'fixed']);
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function formatPath(path) {
  return path || 'Schema';
}

function addError(errors, path, message) {
  errors.push(`${formatPath(path)}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function qualifiedName(name, namespace) {
  if (name.includes('.')) return name;
  return namespace ? `${namespace}.${name}` : name;
}

function validateName(name, path, label, errors) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name.split('.').at(-1))) {
    addError(errors, path, `${label} must be a valid Avro name.`);
    return false;
  }
  return true;
}

function validateLogicalType(schema, path, errors) {
  if ('logicalType' in schema && typeof schema.logicalType !== 'string') {
    addError(errors, path, 'logicalType must be a string.');
  }
}

function validateNamedSchema(schema, path, context, errors) {
  const { type } = schema;
  const hasName = validateName(schema.name, path, `${type} name`, errors);
  const namespace = typeof schema.namespace === 'string' ? schema.namespace : context.namespace;
  const fullName = hasName ? qualifiedName(schema.name, namespace) : null;

  if (fullName) {
    if (context.names.has(fullName)) {
      addError(errors, path, `Duplicate named type "${fullName}".`);
    } else {
      context.names.add(fullName);
    }
  }

  validateLogicalType(schema, path, errors);
  const namedNamespace = fullName?.includes('.')
    ? fullName.split('.').slice(0, -1).join('.')
    : namespace;
  return { fullName, namespace: namedNamespace };
}

function validateRecord(schema, path, context, errors) {
  const record = validateNamedSchema(schema, path, context, errors);
  if (!Array.isArray(schema.fields)) {
    addError(errors, path, 'record must include a fields array.');
    return;
  }

  const fields = new Set();
  schema.fields.forEach((field, index) => {
    const fieldPath = `${path}.fields[${index}]`;
    if (!isObject(field)) {
      addError(errors, fieldPath, 'field must be an object.');
      return;
    }
    if (!validateName(field.name, fieldPath, 'Field name', errors)) return;
    if (fields.has(field.name)) {
      addError(errors, fieldPath, `Duplicate field name "${field.name}".`);
    }
    fields.add(field.name);
    if (!('type' in field)) {
      addError(errors, fieldPath, 'field is missing required property "type".');
      return;
    }
    const fieldContext = { ...context, namespace: record.namespace };
    validateSchema(field.type, `${fieldPath}.type`, fieldContext, errors);
  });
}

function validateEnum(schema, path, context, errors) {
  validateNamedSchema(schema, path, context, errors);
  if (!Array.isArray(schema.symbols) || schema.symbols.length === 0) {
    addError(errors, path, 'enum must include a non-empty symbols array.');
    return;
  }
  const symbols = new Set();
  schema.symbols.forEach((symbol, index) => {
    if (typeof symbol !== 'string' || !NAME_PATTERN.test(symbol)) {
      addError(errors, `${path}.symbols[${index}]`, 'Enum symbol must be a valid Avro name.');
    } else if (symbols.has(symbol)) {
      addError(errors, `${path}.symbols[${index}]`, `Duplicate enum symbol "${symbol}".`);
    }
    symbols.add(symbol);
  });
}

function validateFixed(schema, path, context, errors) {
  validateNamedSchema(schema, path, context, errors);
  if (!Number.isInteger(schema.size) || schema.size <= 0) {
    addError(errors, path, 'fixed must include a positive integer size.');
  }
}

function validateObjectSchema(schema, path, context, errors) {
  if (!('type' in schema)) {
    addError(errors, path, 'Schema is missing required property "type".');
    return;
  }
  if (typeof schema.type !== 'string') {
    if (isObject(schema.type) || Array.isArray(schema.type)) {
      validateSchema(schema.type, `${path}.type`, context, errors);
    } else {
      addError(errors, path, 'Schema type must be a type name, object, or union array.');
    }
    return;
  }
  if (PRIMITIVE_TYPES.has(schema.type)) {
    validateLogicalType(schema, path, errors);
    return;
  }
  if (!COMPLEX_TYPES.has(schema.type)) {
    validateSchema(schema.type, `${path}.type`, context, errors);
    return;
  }
  if (schema.type === 'record') validateRecord(schema, path, context, errors);
  if (schema.type === 'enum') validateEnum(schema, path, context, errors);
  if (schema.type === 'fixed') validateFixed(schema, path, context, errors);
  if (schema.type === 'array') {
    validateLogicalType(schema, path, errors);
    if (!('items' in schema)) addError(errors, path, 'array is missing required property "items".');
    else validateSchema(schema.items, `${path}.items`, context, errors);
  }
  if (schema.type === 'map') {
    validateLogicalType(schema, path, errors);
    if (!('values' in schema)) addError(errors, path, 'map is missing required property "values".');
    else validateSchema(schema.values, `${path}.values`, context, errors);
  }
}

function validateSchema(schema, path, context, errors) {
  if (typeof schema === 'string') {
    const knownType = PRIMITIVE_TYPES.has(schema)
      || context.names.has(qualifiedName(schema, context.namespace));
    if (!knownType) {
      addError(errors, path, `Unresolved named-type reference "${schema}".`);
    }
    return;
  }
  if (Array.isArray(schema)) {
    if (schema.length === 0) addError(errors, path, 'Union must contain at least one branch.');
    schema.forEach((branch, index) => validateSchema(branch, `${path}[${index}]`, context, errors));
    return;
  }
  if (!isObject(schema)) {
    addError(errors, path, 'Schema must be a type name, object, or union array.');
    return;
  }
  validateObjectSchema(schema, path, context, errors);
}

/**
 * Validates Avro schema text without loading any external code or making network requests.
 *
 * @param {string} schemaText JSON-encoded Avro schema.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateAvroSchema(schemaText) {
  let schema;
  try {
    schema = JSON.parse(schemaText);
  } catch (error) {
    return { valid: false, errors: [`Malformed JSON: ${error.message}`] };
  }

  const errors = [];
  validateSchema(schema, 'Schema', { names: new Set(), namespace: '' }, errors);
  return { valid: errors.length === 0, errors };
}

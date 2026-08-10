/** @typedef {{ kind: string, [key: string]: unknown }} TypeNode */

function uniqueTypes(types) {
  const byKey = new Map();
  types.forEach((type) => byKey.set(typeKey(type), type));
  return [...byKey.values()].sort((left, right) => typeKey(left).localeCompare(typeKey(right)));
}

function typeKey(type) {
  if (type.kind === 'array') return `array:${typeKey(type.element)}`;
  if (type.kind === 'object') {
    return `object:${Object.entries(type.properties)
      .map(([key, property]) => `${key}:${property.optional}:${typeKey(property.type)}`)
      .join(',')}`;
  }
  if (type.kind === 'union') return `union:${type.types.map(typeKey).join('|')}`;
  return type.kind;
}

function mergeTypes(types) {
  const unique = uniqueTypes(types);
  if (unique.length === 1) return unique[0];
  if (unique.every((type) => type.kind === 'object')) return mergeObjects(unique);
  return { kind: 'union', types: unique };
}

function mergeObjects(objects) {
  const names = [...new Set(objects.flatMap((object) => Object.keys(object.properties)))].sort();
  const properties = Object.fromEntries(names.map((name) => {
    const present = objects.map((object) => object.properties[name]).filter(Boolean);
    return [name, {
      optional: present.length !== objects.length || present.some((property) => property.optional),
      type: mergeTypes(present.map((property) => property.type)),
    }];
  }));
  return { kind: 'object', properties };
}

/**
 * Infers a serializable TypeScript type tree from a JSON value.
 *
 * @param {unknown} value JSON-compatible value.
 * @returns {TypeNode} Inferred type tree.
 */
export function inferType(value) {
  if (value === null) return { kind: 'null' };
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      element: value.length ? mergeTypes(value.map(inferType)) : { kind: 'unknown' },
    };
  }
  if (typeof value === 'object') {
    const properties = Object.fromEntries(Object.keys(value).sort().map((key) => [key, {
      optional: false,
      type: inferType(value[key]),
    }]));
    return { kind: 'object', properties };
  }
  return { kind: typeof value };
}

function propertyName(name) {
  return /^[$A-Z_a-z][$\w]*$/.test(name) ? name : JSON.stringify(name);
}

function writeType(type, level, options) {
  const indent = options.indent.repeat(level);
  const nextIndent = options.indent.repeat(level + 1);
  if (type.kind === 'array') {
    const element = writeType(type.element, level, options);
    return type.element.kind === 'union' ? `(${element})[]` : `${element}[]`;
  }
  if (type.kind === 'union') {
    return type.types.map((item) => writeType(item, level, options)).join(' | ');
  }
  if (type.kind !== 'object') return type.kind === 'undefined' ? 'unknown' : type.kind;
  const entries = Object.entries(type.properties);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([name, property]) => {
    const modifier = options.readonly ? 'readonly ' : '';
    const optional = property.optional && options.optionalProperties ? '?' : '';
    const undefinedType = property.optional && !options.optionalProperties
      ? ' | undefined'
      : '';
    const propertyType = writeType(property.type, level + 1, options);
    return `${nextIndent}${modifier}${propertyName(name)}${optional}: ${propertyType}${undefinedType};`;
  }).join('\n')}\n${indent}}`;
}

/**
 * Formats a JSON value as a deterministic TypeScript root declaration.
 *
 * @param {unknown} value JSON-compatible value.
 * @param {{ rootName?: string, declaration?: 'interface'|'type', optionalProperties?: boolean,
 * readonly?: boolean, indent?: string }} [settings]
 * @returns {string} TypeScript declaration.
 */
export function formatTypeScript(value, settings = {}) {
  const options = {
    rootName: settings.rootName?.trim() || 'Root',
    declaration: settings.declaration === 'interface' ? 'interface' : 'type',
    optionalProperties: settings.optionalProperties !== false,
    readonly: Boolean(settings.readonly),
    indent: settings.indent || '  ',
  };
  const type = inferType(value);
  if (options.declaration === 'interface' && type.kind === 'object') {
    return `export interface ${options.rootName} ${writeType(type, 0, options)}`;
  }
  return `export type ${options.rootName} = ${writeType(type, 0, options)};`;
}

/**
 * Safely parses JSON and formats its TypeScript declaration without throwing.
 *
 * @param {string} source JSON source text.
 * @param {Parameters<typeof formatTypeScript>[1]} [settings]
 * @returns {{ output: string, error: string }} Formatting result.
 */
export function generateTypeScript(source, settings) {
  if (!source.trim()) return { output: '', error: '' };
  try {
    return { output: formatTypeScript(JSON.parse(source), settings), error: '' };
  } catch (error) {
    return { output: '', error: `Invalid JSON: ${error.message}` };
  }
}

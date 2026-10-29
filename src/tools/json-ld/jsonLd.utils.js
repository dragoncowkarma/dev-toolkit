const JSON_LD_SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const JSON_LD_TYPE_PATTERN = new RegExp(
  String.raw`\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|` +
    String.raw`application\/ld\+json(?=\s|$))`,
  'i',
);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatPath(path, key) {
  return path === '$' ? `$.${key}` : `${path}.${key}`;
}

function normalizeTypes(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((type) => typeof type === 'string');
  return [];
}

function findVocabulary(context) {
  const contexts = Array.isArray(context) ? context : [context];
  const values = contexts.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!isRecord(item)) return [];
    return Object.values(item).filter((value) => typeof value === 'string');
  });

  if (values.some((value) => /schema\.org/i.test(value))) return 'Schema.org';
  if (values.length > 0) return 'Custom vocabulary';
  return 'Not detected';
}

/**
 * Extracts JSON-LD content from application/ld+json script elements.
 *
 * @param {string} input - Raw pasted JSON or HTML containing JSON-LD scripts.
 * @returns {{content: string, strippedScriptTags: boolean}}
 */
export function extractJsonLdContent(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  const documents = [];
  for (const match of input.matchAll(JSON_LD_SCRIPT_PATTERN)) {
    if (JSON_LD_TYPE_PATTERN.test(match[1])) {
      documents.push(match[2].trim());
    }
  }

  if (documents.length === 0) {
    return { content: input.trim(), strippedScriptTags: false };
  }

  return {
    content: documents.length === 1 ? documents[0] : `[${documents.join(',')}]`,
    strippedScriptTags: true,
  };
}

function isIdReference(value, isNested) {
  if (!isNested || !isRecord(value) || !('@id' in value)) return false;
  return Object.keys(value).every((key) => key === '@id');
}

function inspectEntity(value, path, entities, issues, references = [], isNested = false) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      inspectEntity(item, `${path}[${index}]`, entities, issues, references, isNested);
    });
    return;
  }

  if (!isRecord(value)) return;

  const isReference = isIdReference(value, isNested);
  const types = normalizeTypes(value['@type']);
  const isEntity = !isReference && ('@context' in value || '@type' in value || '@id' in value);
  if (isEntity) {
    entities.push({ path, types, id: value['@id'], context: value['@context'] });
  }
  if (isReference && typeof value['@id'] === 'string' && value['@id'].trim() !== '') {
    references.push({ path, id: value['@id'] });
  }

  if ('@context' in value &&
      (value['@context'] === null ||
        (!Array.isArray(value['@context']) && !isRecord(value['@context']) &&
          typeof value['@context'] !== 'string'))) {
    issues.push({
      severity: 'warning',
      path,
      message: '@context should be a URL, object, or array of contexts.',
    });
  }

  if ('@type' in value && types.length === 0) {
    issues.push({
      severity: 'warning',
      path,
      message: '@type should be a string or an array of strings.',
    });
  }

  if ('@id' in value && typeof value['@id'] !== 'string') {
    issues.push({ severity: 'warning', path, message: '@id should be a string.' });
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key !== '@context' && key !== '@type' && key !== '@id') {
      const childIsNested = key !== '@graph' && key !== '@included';
      inspectEntity(child, formatPath(path, key), entities, issues, references, childIsNested);
    }
  });
}

function checkIdGraph(entities, references, issues) {
  const firstSeenById = new Map();

  entities.forEach((entity) => {
    if (typeof entity.id !== 'string' || entity.id.trim() === '') return;

    const firstPath = firstSeenById.get(entity.id);
    if (firstPath !== undefined) {
      issues.push({
        severity: 'warning',
        path: entity.path,
        message: `Duplicate @id "${entity.id}" is already defined at ${firstPath}.`,
      });
      return;
    }

    firstSeenById.set(entity.id, entity.path);
  });

  references.forEach((reference) => {
    if (!firstSeenById.has(reference.id)) {
      issues.push({
        severity: 'warning',
        path: reference.path,
        message: `Unresolved @id reference "${reference.id}" does not match any entity in ` +
          'this document.',
      });
    }
  });
}

/**
 * Parses and inspects a JSON-LD document entirely in the browser.
 *
 * @param {string} input - A JSON-LD document or an embedded JSON-LD script.
 * @returns {{document: object|Array|null, entities: Array, error: string, issues: Array,
 * vocabulary: string, strippedScriptTags: boolean}}
 */
export function inspectJsonLd(input) {
  const { content, strippedScriptTags } = extractJsonLdContent(input);
  const result = {
    document: null,
    entities: [],
    error: '',
    issues: [],
    vocabulary: 'Not detected',
    strippedScriptTags,
  };

  if (content === '') {
    return strippedScriptTags
      ? { ...result, error: 'The JSON-LD script tag is empty.' }
      : result;
  }

  let document;
  try {
    document = JSON.parse(content);
  } catch (error) {
    return { ...result, error: `Invalid JSON: ${error.message}` };
  }

  if (!isRecord(document) && !(Array.isArray(document) && document.every(isRecord))) {
    return { ...result, error: 'A JSON-LD document must be an object or an array of objects.' };
  }

  const references = [];
  inspectEntity(document, '$', result.entities, result.issues, references);
  checkIdGraph(result.entities, references, result.issues);
  const rootItems = Array.isArray(document) ? document : [document];
  if (!rootItems.some((item) => isRecord(item) && '@context' in item)) {
    result.issues.push({
      severity: 'warning',
      path: '$',
      message: 'No top-level @context was found. JSON-LD usually needs one to define its ' +
        'vocabulary.',
    });
  }
  if (result.entities.length === 0 && references.length === 0) {
    result.issues.push({
      severity: 'warning',
      path: '$',
      message: 'No JSON-LD entity metadata (@context, @type, or @id) was found.',
    });
  }

  const contexts = result.entities.map((entity) => entity.context).filter(Boolean);
  result.vocabulary = contexts.map(findVocabulary).find((value) => value === 'Schema.org')
    ?? contexts.map(findVocabulary).find((value) => value !== 'Not detected')
    ?? 'Not detected';
  result.document = document;
  return result;
}

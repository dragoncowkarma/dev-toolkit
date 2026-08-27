import yaml from 'js-yaml';

const RECOGNIZED_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

const PATH_LEVEL_KEYS = new Set([
  '$ref',
  'summary',
  'description',
  'servers',
  'parameters',
]);

/**
 * Parses raw JSON or YAML text into a JavaScript object.
 *
 * @param {string} rawInput - The OpenAPI specification content.
 * @returns {object} Parsed document object.
 * @throws {Error} If parsing fails or output is not an object.
 */
export function parseOpenApi(rawInput) {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new Error('Please provide an OpenAPI document in JSON or YAML format.');
  }

  let doc;
  const trimmed = rawInput.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      doc = JSON.parse(trimmed);
    } catch {
      doc = yaml.load(trimmed);
    }
  } else {
    doc = yaml.load(trimmed);
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Invalid OpenAPI document: root must be an object.');
  }

  return doc;
}

/**
 * Resolves a local $ref string (e.g., "#/components/schemas/User") within the document.
 *
 * @param {object} doc - The root OpenAPI document.
 * @param {string} refStr - The reference path string starting with "#/".
 * @returns {boolean} True if reference target exists.
 */
export function resolveLocalRef(doc, refStr) {
  if (!refStr || typeof refStr !== 'string' || !refStr.startsWith('#/')) {
    return false;
  }
  const parts = refStr.slice(2).split('/');
  let current = doc;
  for (const part of parts) {
    const unescaped = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current && typeof current === 'object' && unescaped in current) {
      current = current[unescaped];
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Recursively inspects document objects to find and validate local $ref pointers.
 *
 * @param {object} doc - Root OpenAPI document.
 * @param {*} current - Current value being inspected.
 * @param {string} currentPath - Line-independent field path.
 * @param {Array<{path: string, message: string}>} warnings - Accumulated warnings.
 */
function validateRefs(doc, current, currentPath, warnings) {
  if (!current || typeof current !== 'object') return;

  if (Array.isArray(current)) {
    current.forEach((item, index) => {
      validateRefs(doc, item, `${currentPath}[${index}]`, warnings);
    });
    return;
  }

  if (typeof current.$ref === 'string' && current.$ref.startsWith('#/')) {
    if (!resolveLocalRef(doc, current.$ref)) {
      warnings.push({
        path: currentPath ? `${currentPath}.$ref` : '$ref',
        message: `Unresolved local reference: '${current.$ref}'.`,
      });
    }
  }

  Object.entries(current).forEach(([key, value]) => {
    if (key !== '$ref') {
      validateRefs(doc, value, currentPath ? `${currentPath}.${key}` : key, warnings);
    }
  });
}

/**
 * Validates focused structural rules of an OpenAPI 3.0/3.1 document.
 *
 * @param {object} doc - Parsed OpenAPI document object.
 * @returns {{ errors: Array<{path: string, message: string}>,
 *             warnings: Array<{path: string, message: string}> }} Validation findings.
 */
export function validateOpenApi(doc) {
  const errors = [];
  const warnings = [];

  if (!doc.openapi || typeof doc.openapi !== 'string') {
    errors.push({
      path: 'openapi',
      message: "Missing required 'openapi' version field.",
    });
  } else if (!/^3\.[01]\./.test(doc.openapi)) {
    errors.push({
      path: 'openapi',
      message:
        `Unsupported OpenAPI version: "${doc.openapi}". ` +
        'Only OpenAPI 3.0.x and 3.1.x are supported.',
    });
  }

  if (!doc.paths || typeof doc.paths !== 'object' || Array.isArray(doc.paths)) {
    errors.push({
      path: 'paths',
      message: "'paths' must be an object.",
    });
    validateRefs(doc, doc, '', warnings);
    return { errors, warnings };
  }

  const operationIdMap = new Map();

  Object.entries(doc.paths).forEach(([pathKey, pathObj]) => {
    const pathField = `paths.${pathKey}`;
    if (!pathKey.startsWith('/')) {
      errors.push({
        path: pathField,
        message: `Path key must start with '/': ${pathKey}`,
      });
    }

    if (!pathObj || typeof pathObj !== 'object' || Array.isArray(pathObj)) {
      return;
    }

    Object.entries(pathObj).forEach(([methodKey, opObj]) => {
      if (methodKey.startsWith('x-') || PATH_LEVEL_KEYS.has(methodKey)) {
        return;
      }

      const lowerMethod = methodKey.toLowerCase();
      const opField = `${pathField}.${methodKey}`;

      if (!RECOGNIZED_METHODS.has(lowerMethod)) {
        errors.push({
          path: opField,
          message: `Unrecognized HTTP method: '${methodKey}'.`,
        });
        return;
      }

      if (!opObj || typeof opObj !== 'object' || Array.isArray(opObj)) {
        errors.push({
          path: `${opField}.responses`,
          message: "Operation is missing 'responses' object.",
        });
        return;
      }

      if (!opObj.responses || typeof opObj.responses !== 'object') {
        errors.push({
          path: `${opField}.responses`,
          message: "Operation is missing 'responses' object.",
        });
      }

      if (opObj.operationId && typeof opObj.operationId === 'string') {
        const opId = opObj.operationId;
        if (operationIdMap.has(opId)) {
          warnings.push({
            path: `${opField}.operationId`,
            message: `Duplicate operationId: '${opId}'.`,
          });
        } else {
          operationIdMap.set(opId, true);
        }
      }
    });
  });

  validateRefs(doc, doc, '', warnings);

  return { errors, warnings };
}

/**
 * Builds a deterministic summary of an OpenAPI document.
 *
 * @param {object} doc - Parsed OpenAPI document.
 * @returns {object} Summary object.
 */
export function summarizeOpenApi(doc) {
  const title = doc.info?.title || 'Untitled API';
  const version = doc.info?.version || 'Unspecified';
  const openApiVersion = doc.openapi || 'Unknown';
  const servers = Array.isArray(doc.servers)
    ? doc.servers.map((s) => (s && typeof s.url === 'string' ? s.url : '')).filter(Boolean)
    : [];

  let pathCount = 0;
  let operationCount = 0;
  const methodCounts = {};
  const operations = [];

  if (doc.paths && typeof doc.paths === 'object' && !Array.isArray(doc.paths)) {
    Object.entries(doc.paths).forEach(([pathKey, pathObj]) => {
      if (!pathKey.startsWith('/') || !pathObj || typeof pathObj !== 'object') return;
      pathCount += 1;

      Object.entries(pathObj).forEach(([methodKey, opObj]) => {
        if (methodKey.startsWith('x-') || PATH_LEVEL_KEYS.has(methodKey)) return;
        const upperMethod = methodKey.toUpperCase();
        if (!RECOGNIZED_METHODS.has(methodKey.toLowerCase())) return;

        operationCount += 1;
        methodCounts[upperMethod] = (methodCounts[upperMethod] || 0) + 1;

        const summaryStr = opObj?.summary || '';
        const opId = opObj?.operationId || '';
        const tags = Array.isArray(opObj?.tags) ? opObj.tags : [];
        const responses =
          opObj?.responses && typeof opObj.responses === 'object'
            ? Object.keys(opObj.responses)
            : [];

        const params = [];
        if (Array.isArray(opObj?.parameters)) {
          opObj.parameters.forEach((p) => {
            if (p && typeof p === 'object') {
              if (p.name && p.in) {
                params.push({ name: p.name, in: p.in });
              } else if (p.$ref) {
                params.push({ name: p.$ref, in: '$ref' });
              }
            }
          });
        }

        operations.push({
          method: upperMethod,
          path: pathKey,
          operationId: opId,
          summary: summaryStr,
          tags,
          parameters: params,
          responses,
        });
      });
    });
  }

  const securitySchemes = [];
  if (doc.components?.securitySchemes && typeof doc.components.securitySchemes === 'object') {
    Object.entries(doc.components.securitySchemes).forEach(([key, schemeObj]) => {
      if (schemeObj && typeof schemeObj === 'object') {
        securitySchemes.push({
          key,
          type: schemeObj.type || 'unknown',
          scheme: schemeObj.scheme,
          name: schemeObj.name,
          in: schemeObj.in,
          bearerFormat: schemeObj.bearerFormat,
        });
      }
    });
  }

  return {
    title,
    version,
    openApiVersion,
    servers,
    pathCount,
    operationCount,
    methodCounts,
    securitySchemes,
    operations,
  };
}

/**
 * Generates a concise readable text summary of an OpenAPI document.
 *
 * @param {object} summary - Summary object from summarizeOpenApi.
 * @returns {string} Formatted plain text summary.
 */
export function generateApiSummaryText(summary) {
  if (!summary) return '';

  const lines = [
    `Title: ${summary.title}`,
    `API Version: ${summary.version}`,
    `OpenAPI Version: ${summary.openApiVersion}`,
  ];

  if (summary.servers.length > 0) {
    lines.push('Servers:');
    summary.servers.forEach((url) => lines.push(`  - ${url}`));
  } else {
    lines.push('Servers: None');
  }

  const methodSummary = Object.entries(summary.methodCounts)
    .map(([m, count]) => `${m}: ${count}`)
    .join(', ');

  lines.push(`Paths: ${summary.pathCount}`);
  lines.push(
    `Operations: ${summary.operationCount}` + (methodSummary ? ` (${methodSummary})` : '')
  );

  lines.push('');
  lines.push('Security Schemes:');
  if (summary.securitySchemes.length > 0) {
    summary.securitySchemes.forEach((s) => {
      const details = [s.type ? `type: ${s.type}` : '', s.scheme ? `scheme: ${s.scheme}` : '']
        .filter(Boolean)
        .join(', ');
      lines.push(`  - ${s.key} (${details})`);
    });
  } else {
    lines.push('  None');
  }

  lines.push('');
  lines.push('Operations:');
  if (summary.operations.length > 0) {
    summary.operations.forEach((op) => {
      const idStr = op.operationId ? ` [${op.operationId}]` : '';
      lines.push(`  - ${op.method} ${op.path}${idStr}`);
      if (op.summary) lines.push(`    Summary: ${op.summary}`);
      if (op.tags.length > 0) lines.push(`    Tags: ${op.tags.join(', ')}`);
      if (op.parameters.length > 0) {
        const paramStr = op.parameters
          .map((p) => (p.in ? `${p.name} (${p.in})` : p.name))
          .join(', ');
        lines.push(`    Parameters: ${paramStr}`);
      }
      if (op.responses.length > 0) {
        lines.push(`    Responses: ${op.responses.join(', ')}`);
      }
    });
  } else {
    lines.push('  None');
  }

  return lines.join('\n');
}

/**
 * Main inspection function that parses, validates, and summarizes OpenAPI input.
 * Never throws an exception.
 *
 * @param {string} rawInput - Raw YAML or JSON input string.
 * @returns {object} Inspection result object.
 */
export function inspectOpenApi(rawInput) {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    return {
      valid: false,
      parseError: null,
      errors: [],
      warnings: [],
      summary: null,
      normalizedJson: null,
    };
  }

  let doc;
  try {
    doc = parseOpenApi(rawInput);
  } catch (err) {
    return {
      valid: false,
      parseError: err.message || 'Failed to parse OpenAPI document.',
      errors: [],
      warnings: [],
      summary: null,
      normalizedJson: null,
    };
  }

  const { errors, warnings } = validateOpenApi(doc);
  const valid = errors.length === 0;
  const summary = summarizeOpenApi(doc);
  const normalizedJson = JSON.stringify(doc, null, 2);

  return {
    valid,
    parseError: null,
    errors,
    warnings,
    summary,
    normalizedJson,
  };
}

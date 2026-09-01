import { describe, expect, it } from 'vitest';
import {
  generateApiSummaryText,
  inspectOpenApi,
  parseOpenApi,
  resolveLocalRef,
  summarizeOpenApi,
  validateOpenApi,
} from './openApiInspector.utils.js';

const VALID_JSON_30 = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'JSON 3.0 API', version: '1.2.3' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/users': {
      get: {
        operationId: 'getUsers',
        summary: 'Get all users',
        tags: ['Users'],
        parameters: [{ name: 'limit', in: 'query' }],
        responses: {
          '200': { description: 'Success' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
});

const VALID_YAML_31 = `
openapi: 3.1.0
info:
  title: YAML 3.1 API
  version: 2.0.0
servers:
  - url: https://api.yaml.org/v2
paths:
  /items:
    post:
      operationId: createItem
      tags:
        - Items
      responses:
        '201':
          description: Created
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-KEY
`;

describe('parseOpenApi', () => {
  it('parses valid JSON spec', () => {
    const result = parseOpenApi(VALID_JSON_30);
    expect(result.openapi).toBe('3.0.3');
    expect(result.info.title).toBe('JSON 3.0 API');
  });

  it('parses valid YAML spec', () => {
    const result = parseOpenApi(VALID_YAML_31);
    expect(result.openapi).toBe('3.1.0');
    expect(result.info.title).toBe('YAML 3.1 API');
  });

  it('throws for empty input', () => {
    expect(() => parseOpenApi('')).toThrow(/provide an OpenAPI document/);
  });

  it('throws for non-object output', () => {
    expect(() => parseOpenApi('just a string')).toThrow(/root must be an object/);
  });
});

describe('validateOpenApi', () => {
  it('detects missing openapi version', () => {
    const { errors } = validateOpenApi({ info: { title: 'No version' }, paths: {} });
    expect(errors).toEqual([
      { path: 'openapi', message: "Missing required 'openapi' version field." },
    ]);
  });

  it('detects unsupported openapi version', () => {
    const { errors } = validateOpenApi({ openapi: '2.0', paths: {} });
    expect(errors[0].path).toBe('openapi');
    expect(errors[0].message).toContain('Unsupported OpenAPI version: "2.0"');
  });

  it('detects invalid paths type', () => {
    const { errors } = validateOpenApi({ openapi: '3.0.0', paths: 'invalid' });
    expect(errors).toEqual([{ path: 'paths', message: "'paths' must be an object." }]);
  });

  it('detects invalid path keys not starting with /', () => {
    const { errors } = validateOpenApi({
      openapi: '3.0.0',
      paths: { users: {} },
    });
    expect(errors).toEqual([
      { path: 'paths.users', message: "Path key must start with '/': users" },
    ]);
  });

  it('detects unrecognized HTTP methods', () => {
    const { errors } = validateOpenApi({
      openapi: '3.0.0',
      paths: {
        '/users': {
          invalidMethod: { responses: {} },
        },
      },
    });
    expect(errors).toEqual([
      {
        path: 'paths./users.invalidMethod',
        message: "Unrecognized HTTP method: 'invalidMethod'.",
      },
    ]);
  });

  it('detects missing responses object', () => {
    const { errors } = validateOpenApi({
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: {},
        },
      },
    });
    expect(errors).toEqual([
      {
        path: 'paths./users.get.responses',
        message: "Operation is missing 'responses' object.",
      },
    ]);
  });

  it('detects duplicate operationIds', () => {
    const { warnings } = validateOpenApi({
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: { operationId: 'duplicateId', responses: { '200': {} } },
        },
        '/profile': {
          get: { operationId: 'duplicateId', responses: { '200': {} } },
        },
      },
    });
    expect(warnings).toEqual([
      {
        path: 'paths./profile.get.operationId',
        message: "Duplicate operationId: 'duplicateId'.",
      },
    ]);
  });

  it('validates resolved and unresolved local refs', () => {
    const doc = {
      openapi: '3.0.0',
      paths: {
        '/pets': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ValidSchema' },
                  },
                },
              },
              '400': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/InvalidSchema' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ValidSchema: { type: 'string' },
        },
      },
    };

    const { warnings } = validateOpenApi(doc);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain(
      "Unresolved local reference: '#/components/schemas/InvalidSchema'"
    );
  });
});

describe('resolveLocalRef', () => {
  const doc = {
    components: {
      schemas: {
        User: { type: 'object' },
      },
    },
  };

  it('returns true for resolvable local reference', () => {
    expect(resolveLocalRef(doc, '#/components/schemas/User')).toBe(true);
  });

  it('returns false for unresolvable local reference', () => {
    expect(resolveLocalRef(doc, '#/components/schemas/Missing')).toBe(false);
  });

  it('returns false for inherited prototype properties like toString', () => {
    expect(resolveLocalRef(doc, '#/components/schemas/toString')).toBe(false);
    expect(resolveLocalRef(doc, '#/components/schemas/valueOf')).toBe(false);
  });

  it('returns true for an own property named toString', () => {
    const docWithToString = {
      components: {
        schemas: {
          toString: { type: 'string' },
        },
      },
    };
    expect(resolveLocalRef(docWithToString, '#/components/schemas/toString')).toBe(true);
  });
});

describe('summarizeOpenApi and generateApiSummaryText', () => {
  it('creates deterministic summary and summary text for OpenAPI 3.0 JSON', () => {
    const doc = parseOpenApi(VALID_JSON_30);
    const summary = summarizeOpenApi(doc);

    expect(summary.title).toBe('JSON 3.0 API');
    expect(summary.version).toBe('1.2.3');
    expect(summary.openApiVersion).toBe('3.0.3');
    expect(summary.servers).toEqual(['https://api.example.com/v1']);
    expect(summary.pathCount).toBe(1);
    expect(summary.operationCount).toBe(1);
    expect(summary.methodCounts).toEqual({ GET: 1 });
    expect(summary.securitySchemes).toEqual([
      {
        key: 'BearerAuth',
        type: 'http',
        scheme: 'bearer',
        name: undefined,
        in: undefined,
        bearerFormat: undefined,
      },
    ]);

    const text = generateApiSummaryText(summary);
    expect(text).toContain('Title: JSON 3.0 API');
    expect(text).toContain('Paths: 1');
    expect(text).toContain('GET /users [getUsers]');
  });

  it('creates summary for OpenAPI 3.1 YAML', () => {
    const doc = parseOpenApi(VALID_YAML_31);
    const summary = summarizeOpenApi(doc);

    expect(summary.title).toBe('YAML 3.1 API');
    expect(summary.pathCount).toBe(1);
    expect(summary.operationCount).toBe(1);
    expect(summary.methodCounts).toEqual({ POST: 1 });
  });
});

describe('inspectOpenApi', () => {
  it('never throws on malformed input and returns parseError', () => {
    const result = inspectOpenApi('{ invalid json: ');
    expect(result.valid).toBe(false);
    expect(result.parseError).toBeDefined();
    expect(result.summary).toBeNull();
  });

  it('returns valid result for valid spec', () => {
    const result = inspectOpenApi(VALID_JSON_30);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedJson).toBeDefined();
    expect(result.summary.title).toBe('JSON 3.0 API');
  });

  it('handles cyclic YAML aliases safely without throwing', () => {
    const cyclicYaml = `
openapi: 3.0.3
info:
  title: test
  version: 1
paths: {}
components:
  schemas:
    Loop: &loop
      self: *loop
`;
    expect(() => inspectOpenApi(cyclicYaml)).not.toThrow();
    const result = inspectOpenApi(cyclicYaml);
    expect(result.valid).toBe(false);
    expect(result.parseError).toBeDefined();
    expect(result.summary).toBeNull();
  });
});

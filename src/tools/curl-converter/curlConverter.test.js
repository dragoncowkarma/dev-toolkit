import { describe, expect, it } from 'vitest';
import {
  encodeBase64,
  generateAxios,
  generateFetch,
  generateNode,
  parseCurl,
  tokenizeCodeForHighlight,
  tokenizeCommand,
} from './curlConverter.utils.js';

describe('tokenizeCommand', () => {
  it('splits on whitespace outside of quotes', () => {
    expect(tokenizeCommand('curl -X GET https://example.com')).toEqual([
      'curl', '-X', 'GET', 'https://example.com',
    ]);
  });

  it('preserves spaces inside single and double quoted segments', () => {
    expect(tokenizeCommand('curl -H "Accept: application/json" -d \'a b c\''))
      .toEqual(['curl', '-H', 'Accept: application/json', '-d', 'a b c']);
  });

  it('resolves backslash-escaped double quotes', () => {
    expect(tokenizeCommand('curl -d "{\\"a\\":1}"')).toEqual(['curl', '-d', '{"a":1}']);
  });

  it('throws on an unterminated quote', () => {
    expect(() => tokenizeCommand("curl -d 'unterminated")).toThrow('Unterminated quote');
  });
});

describe('parseCurl - errors', () => {
  it('rejects empty input', () => {
    expect(() => parseCurl('')).toThrow('Enter a cURL command to convert.');
  });

  it('rejects whitespace-only input', () => {
    expect(() => parseCurl('   \n  ')).toThrow('Enter a cURL command to convert.');
  });

  it('rejects commands that do not start with curl', () => {
    expect(() => parseCurl('wget https://example.com')).toThrow('must start with "curl"');
  });

  it('rejects commands with no URL', () => {
    expect(() => parseCurl('curl -X GET')).toThrow('No URL found');
  });

  it('rejects an unparseable URL', () => {
    expect(() => parseCurl('curl "not a url"')).toThrow('Invalid URL');
  });

  it('rejects a malformed header missing a colon', () => {
    expect(() => parseCurl('curl https://example.com -H "NoColonHere"'))
      .toThrow('Invalid header');
  });
});

describe('parseCurl - method, URL, and headers', () => {
  it('defaults to GET when no method or body is given', () => {
    const parsed = parseCurl('curl https://example.com/users');
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('https://example.com/users');
  });

  it('reads an explicit method from -X and uppercases it', () => {
    const parsed = parseCurl('curl -X put https://example.com/users/1');
    expect(parsed.method).toBe('PUT');
  });

  it('reads an explicit method from --request', () => {
    const parsed = parseCurl('curl --request DELETE https://example.com/users/1');
    expect(parsed.method).toBe('DELETE');
  });

  it('collects repeated -H headers', () => {
    const parsed = parseCurl(
      'curl https://example.com -H "Accept: application/json" -H "X-Client: dev-toolkit"',
    );
    expect(parsed.headers).toEqual({
      Accept: 'application/json',
      'X-Client': 'dev-toolkit',
    });
  });

  it('parses query parameters from the URL', () => {
    const parsed = parseCurl('curl "https://example.com/search?q=cats&page=2"');
    expect(parsed.queryParams).toEqual({ q: 'cats', page: '2' });
  });

  it('parses a multi-line command joined with backslash continuations', () => {
    const parsed = parseCurl(
      'curl https://example.com/users \\\n  -H "Accept: application/json" \\\n  -X POST',
    );
    expect(parsed.method).toBe('POST');
    expect(parsed.headers).toEqual({ Accept: 'application/json' });
  });
});

describe('parseCurl - body parsing', () => {
  it('infers POST and parses a JSON body from -d', () => {
    const parsed = parseCurl(
      'curl https://example.com/users -d \'{"name":"Ada","role":"Engineer"}\'',
    );
    expect(parsed.method).toBe('POST');
    expect(parsed.bodyType).toBe('json');
    expect(parsed.body).toEqual({ name: 'Ada', role: 'Engineer' });
    expect(parsed.headers['Content-Type']).toBe('application/json');
  });

  it('respects an explicit Content-Type header for JSON bodies', () => {
    const parsed = parseCurl(
      'curl https://example.com/users -H "Content-Type: application/json" '
        + '-d \'{"name":"Ada"}\'',
    );
    expect(parsed.bodyType).toBe('json');
    expect(parsed.body).toEqual({ name: 'Ada' });
  });

  it('joins repeated -d flags with & and defaults to urlencoded', () => {
    const parsed = parseCurl('curl https://example.com/users -d "a=1" -d "b=2"');
    expect(parsed.bodyType).toBe('urlencoded');
    expect(parsed.body).toBe('a=1&b=2');
    expect(parsed.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('treats --data-raw and --data-binary like --data', () => {
    const parsedRaw = parseCurl('curl https://example.com --data-raw "plain text"');
    expect(parsedRaw.bodyType).toBe('text');
    expect(parsedRaw.body).toBe('plain text');

    const parsedBinary = parseCurl('curl https://example.com --data-binary "plain text"');
    expect(parsedBinary.bodyType).toBe('text');
  });

  it('parses -F/--form flags into multipart form-data entries', () => {
    const parsed = parseCurl(
      'curl https://example.com/upload -F "field1=value1" -F "file1=@photo.png"',
    );
    expect(parsed.method).toBe('POST');
    expect(parsed.bodyType).toBe('form-data');
    expect(parsed.body).toEqual([
      { key: 'field1', value: 'value1', isFile: false },
      { key: 'file1', value: '@photo.png', isFile: true },
    ]);
  });

  it('falls back to text when JSON-looking data fails to parse', () => {
    const parsed = parseCurl('curl https://example.com -d "{not valid json"');
    expect(parsed.bodyType).toBe('text');
    expect(parsed.body).toBe('{not valid json');
  });
});

describe('parseCurl - basic auth', () => {
  it('generates a Basic Authorization header from -u user:pass', () => {
    const parsed = parseCurl('curl https://example.com -u "admin:s3cret"');
    expect(parsed.headers.Authorization).toBe(`Basic ${encodeBase64('admin:s3cret')}`);
  });

  it('generates a Basic Authorization header from --user', () => {
    const parsed = parseCurl('curl https://example.com --user "admin:s3cret"');
    expect(parsed.headers.Authorization).toBe(`Basic ${encodeBase64('admin:s3cret')}`);
  });

  it('supports passwords containing a colon', () => {
    const parsed = parseCurl('curl https://example.com -u "admin:pa:ss"');
    expect(parsed.headers.Authorization).toBe(`Basic ${encodeBase64('admin:pa:ss')}`);
  });
});

describe('encodeBase64', () => {
  it('matches known Base64 encodings', () => {
    expect(encodeBase64('admin:s3cret')).toBe('YWRtaW46czNjcmV0');
  });
});

describe('generateFetch', () => {
  it('generates a fetch snippet with method, headers, and JSON body', () => {
    const parsed = parseCurl(
      'curl -X POST https://example.com/users -H "Content-Type: application/json" '
        + '-d \'{"name":"Ada"}\'',
    );
    const code = generateFetch(parsed);
    expect(code).toContain("fetch(\"https://example.com/users\"");
    expect(code).toContain("method: \"POST\"");
    expect(code).toContain('"Content-Type": "application/json"');
    expect(code).toContain('body: JSON.stringify({');
    expect(code).toContain('"name": "Ada"');
  });

  it('omits the body option for GET requests without data', () => {
    const parsed = parseCurl('curl https://example.com/users');
    const code = generateFetch(parsed);
    expect(code).not.toContain('body:');
  });

  it('builds FormData statements for multipart bodies', () => {
    const parsed = parseCurl('curl https://example.com/upload -F "field1=value1"');
    const code = generateFetch(parsed);
    expect(code).toContain('const formData = new FormData();');
    expect(code).toContain('formData.append("field1", "value1");');
    expect(code).toContain('body: formData');
  });
});

describe('generateAxios', () => {
  it('generates an axios.request snippet with a lowercase method', () => {
    const parsed = parseCurl('curl -X POST https://example.com/users -d \'{"name":"Ada"}\'');
    const code = generateAxios(parsed);
    expect(code).toContain('axios.request({');
    expect(code).toContain('method: "post"');
    expect(code).toContain('url: "https://example.com/users"');
    expect(code).toContain('data: JSON.stringify({');
    expect(code).toContain('response.data');
  });
});

describe('generateNode', () => {
  it('generates an https.request snippet with hostname, path, and headers', () => {
    const parsed = parseCurl(
      'curl "https://example.com/users?active=true" -H "Accept: application/json"',
    );
    const code = generateNode(parsed);
    expect(code).toContain("require(\"https\")");
    expect(code).toContain('hostname: "example.com"');
    expect(code).toContain('path: "/users?active=true"');
    expect(code).toContain('"Accept": "application/json"');
  });

  it('writes the request body for JSON payloads', () => {
    const parsed = parseCurl('curl https://example.com/users -d \'{"name":"Ada"}\'');
    const code = generateNode(parsed);
    expect(code).toContain('req.write(JSON.stringify({');
    expect(code).toContain('req.end();');
  });

  it('notes that form-data requires manual encoding', () => {
    const parsed = parseCurl('curl https://example.com/upload -F "field1=value1"');
    const code = generateNode(parsed);
    expect(code).toContain('Multipart form-data requires manual boundary encoding');
    expect(code).not.toContain('req.write(');
  });
});

describe('tokenizeCodeForHighlight', () => {
  it('classifies keywords, strings, and comments separately from plain text', () => {
    const tokens = tokenizeCodeForHighlight("const x = 'hi'; // note");
    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'const', type: 'keyword' }),
      expect.objectContaining({ text: "'hi'", type: 'string' }),
      expect.objectContaining({ text: '// note', type: 'comment' }),
    ]));
  });

  it('reassembles to the original source when concatenated', () => {
    const code = 'const response = await fetch("https://example.com");';
    const tokens = tokenizeCodeForHighlight(code);
    expect(tokens.map((token) => token.text).join('')).toBe(code);
  });
});

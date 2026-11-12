import { describe, expect, it } from 'vitest';
import { parseCsr } from './csrDecoder.utils.js';

function concat(...parts) {
  return Uint8Array.from(parts.flatMap((part) => Array.from(part)));
}

function der(tag, value) {
  const bytes = Uint8Array.from(value);
  const length = bytes.length < 128
    ? [bytes.length]
    : [129, bytes.length];
  return concat([tag, ...length], bytes);
}

function oid(value) {
  return der(6, value);
}

function algorithm() {
  return der(48, concat(oid([42, 134, 72, 134, 247, 13, 1, 1, 1]), der(5, [])));
}

function subjectAttribute(oidValue, text) {
  return der(48, concat(oid(oidValue), der(12, new TextEncoder().encode(text))));
}

function toPem(bytes) {
  const body = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  return `-----BEGIN CERTIFICATE REQUEST-----\n${body}\n-----END CERTIFICATE REQUEST-----`;
}

function makeCsr({ subject, attributes = der(160, []) }) {
  const publicKey = der(48, concat(der(2, [1]), der(2, [1])));
  const keyInfo = der(48, concat(algorithm(), der(3, concat([0], publicKey))));
  const info = der(48, concat(der(2, [0]), subject, keyInfo, attributes));
  return toPem(der(48, concat(info, algorithm(), der(3, [0]))));
}

describe('CSR decoder', () => {
  it('retains every attribute in a multi-valued relative distinguished name', () => {
    const attributes = der(49, concat(
      subjectAttribute([85, 4, 3], 'example.test'),
      subjectAttribute([85, 4, 11], 'Platform')
    ));
    const result = parseCsr(makeCsr({ subject: der(48, attributes) }));

    expect(result.subject).toEqual([
      { name: 'Common Name', value: 'example.test' },
      { name: 'Organizational Unit', value: 'Platform' },
    ]);
  });

  it('reports RFC822 subject alternative names as email addresses', () => {
    const names = der(48, der(129, new TextEncoder().encode('admin@example.test')));
    const extension = der(48, concat(oid([85, 29, 17]), der(4, names)));
    const extensions = der(48, extension);
    const extensionRequest = der(48, concat(
      oid([42, 134, 72, 134, 247, 13, 1, 9, 14]),
      der(49, extensions)
    ));
    const result = parseCsr(makeCsr({
      subject: der(48, []),
      attributes: der(160, extensionRequest),
    }));

    expect(result.extensions).toContainEqual({
      name: 'Subject Alternative Name',
      value: 'email:admin@example.test',
    });
  });

  it('rejects an object identifier ending in an unterminated continuation byte', () => {
    const subject = der(48, der(49, der(48, concat(oid([85, 128]), der(12, [120])))));

    expect(() => parseCsr(makeCsr({ subject }))).toThrow('truncated object identifier');
  });
});

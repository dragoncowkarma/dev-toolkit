import { describe, expect, it } from 'vitest';
import {
  ASN1_TAG,
  decodeAsn1String,
  decodeAsn1Time,
  decodeBase64ToBytes,
  decodeCertificates,
  decodeOid,
  extractPemBlocks,
  formatDuration,
  formatHexGroups,
  formatUtc,
  getIntegerBitLength,
  getValidityStatus,
  parseAsn1,
  parseCertificate,
  toHex,
} from './certificateDecoder.utils.js';
import {
  EC_CERTIFICATE,
  EXPIRED_CERTIFICATE,
  NOT_YET_VALID_CERTIFICATE,
  SAMPLE_CERTIFICATE,
} from './certificateDecoder.samples.js';

const SAMPLE_DN =
  'C=KR, ST=Seoul, L=Gangnam, O=Dev Toolkit, OU=Engineering, CN=devtoolkit.example';

/** Rebuilds a PEM block from a raw Base64 body, so tests can corrupt bodies. */
function toPem(body) {
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
}

function bodyOf(pem) {
  return extractPemBlocks(pem)[0].body;
}

/** Wraps `05 00` (NULL) in `depth` nested SEQUENCE headers. */
function buildNestedSequences(depth) {
  let bytes = [ASN1_TAG.NULL, 0x00];
  for (let index = 0; index < depth; index += 1) {
    bytes = [0x30, bytes.length, ...bytes];
  }
  return Uint8Array.from(bytes);
}

function decodeOne(pem) {
  const [entry] = decodeCertificates(pem);
  return entry;
}

/** Wraps content bytes in a DER header for `identifier`, so tests can re-encode input. */
function encodeTlv(identifier, content) {
  let header;
  if (content.length < 0x80) header = [identifier, content.length];
  else if (content.length < 0x100) header = [identifier, 0x81, content.length];
  else header = [identifier, 0x82, content.length >> 8, content.length & 0xff];
  return Uint8Array.from([...header, ...content]);
}

/** Wraps content bytes in a DER SEQUENCE header, so tests can re-encode input. */
function encodeSequence(content) {
  return encodeTlv(0x30, content);
}

/** Wraps content bytes in a constructed context-specific `[tagNumber]` header. */
function encodeContext(tagNumber, content) {
  return encodeTlv(0xa0 | tagNumber, content);
}

/** Counts the optional context-specific version wrapper in front of `tbsCertificate`. */
function tbsVersionFields(der) {
  return parseAsn1(der).children[0].children[0].tagClass === 0 ? 0 : 1;
}

/** Locates the AlgorithmIdentifier that `tbsCertificate` repeats before its issuer. */
function tbsSignatureField(der) {
  return parseAsn1(der).children[0].children[tbsVersionFields(der) + 1];
}

/** Locates the `validity` SEQUENCE, which follows serialNumber, signature and issuer. */
function tbsValidityField(der) {
  return parseAsn1(der).children[0].children[tbsVersionFields(der) + 3];
}

/**
 * Rewrites the sample certificate's `notBefore` text in place, so a mutation
 * changes nothing but the validity characters under test.
 */
function withNotBefore(der, text) {
  const notBefore = tbsValidityField(der).children[0];
  const mutated = Uint8Array.from(der);
  const start = notBefore.end - notBefore.content.length;
  expect(notBefore.content).toHaveLength(text.length);
  for (let index = 0; index < text.length; index += 1) {
    mutated[start + index] = text.charCodeAt(index);
  }
  return mutated;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** Re-encodes a SEQUENCE with one surplus `NULL` field appended to its content. */
function withSurplusField(node) {
  return encodeSequence(concatBytes([node.content, Uint8Array.from([ASN1_TAG.NULL, 0x00])]));
}

/**
 * Rebuilds the certificate with a surplus field appended to the chosen signature
 * AlgorithmIdentifiers, re-encoding every enclosing DER length so the result
 * stays well-formed. Padding both sides keeps the two identifiers byte-equal,
 * which is what makes this a structural rather than a mismatch defect.
 */
function withSurplusSignatureFields(der, { body = false, outer = false } = {}) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const bodySignatureIndex = tbsVersionFields(der) + 1;
  const tbsContent = tbs.children.map((field, index) =>
    body && index === bodySignatureIndex ? withSurplusField(field) : field.raw,
  );
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes(tbsContent)),
      outer ? withSurplusField(certificate.children[1]) : certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
}

/** Locates the `[3]` extensions wrapper, the last `tbsCertificate` field. */
function tbsExtensionsField(der) {
  const tbs = parseAsn1(der).children[0];
  return tbs.children[tbs.children.length - 1];
}

/**
 * Rebuilds the certificate with `tail` replacing every `tbsCertificate` field
 * after `subjectPublicKeyInfo`, re-encoding both enclosing SEQUENCE lengths so
 * the mutation stays well-formed DER and only the optional tail differs.
 */
function withTbsTail(der, tail) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const publicKeyIndex = tbsVersionFields(der) + 5;
  const head = tbs.children.slice(0, publicKeyIndex + 1).map((field) => field.raw);
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes([...head, ...tail])),
      certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
}

/** Re-encodes a PEM block around mutated DER bytes. */
function toPemFromDer(der) {
  return toPem(btoa(String.fromCharCode(...der)));
}

/** An IMPLICIT `UniqueIdentifier` BIT STRING under the given context tag. */
function uniqueIdField(tagNumber) {
  return Uint8Array.from([0x80 | tagNumber, 0x02, 0x00, 0xff]);
}

/** Parses a standalone UTCTime or GeneralizedTime element from its text. */
function timeNode(tag, text) {
  const bytes = Uint8Array.from([tag, text.length, ...text.split('').map((c) => c.charCodeAt(0))]);
  return parseAsn1(bytes);
}

describe('extractPemBlocks', () => {
  it('returns every block in document order with whitespace stripped', () => {
    const blocks = extractPemBlocks(`noise\n${SAMPLE_CERTIFICATE}\nnoise\n${EC_CERTIFICATE}`);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.label === 'CERTIFICATE')).toBe(true);
    expect(blocks[0].body).not.toMatch(/\s/);
  });

  it('ignores unterminated armour and non-string input', () => {
    expect(extractPemBlocks('-----BEGIN CERTIFICATE-----\nMIIB\n')).toEqual([]);
    expect(extractPemBlocks(null)).toEqual([]);
  });
});

describe('decodeBase64ToBytes', () => {
  it('decodes padded Base64 containing line breaks', () => {
    expect(toHex(decodeBase64ToBytes('MDEy\nMw=='))).toBe('30313233');
  });

  it('rejects bodies with an invalid length or alphabet', () => {
    expect(() => decodeBase64ToBytes('MDEyM')).toThrow('not valid Base64 data');
    expect(() => decodeBase64ToBytes('MD_y')).toThrow('not valid Base64 data');
    expect(() => decodeBase64ToBytes('')).toThrow('not valid Base64 data');
  });
});

describe('decodeOid', () => {
  it('splits the first subidentifier into its two leading arcs', () => {
    expect(decodeOid(Uint8Array.from([0x55, 0x04, 0x03]))).toBe('2.5.4.3');
    expect(decodeOid(Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d]))).toBe(
      '1.2.840.113549',
    );
    expect(decodeOid(Uint8Array.from([0x28, 0xc2, 0x7b]))).toBe('1.0.8571');
  });

  it('rejects empty and truncated encodings', () => {
    expect(() => decodeOid(Uint8Array.from([]))).toThrow('is empty');
    expect(() => decodeOid(Uint8Array.from([0x55, 0x81]))).toThrow('truncated');
  });
});

describe('parseAsn1', () => {
  it('builds a child tree for constructed elements only', () => {
    // SEQUENCE { INTEGER 1, NULL }
    const node = parseAsn1(Uint8Array.from([0x30, 0x05, 0x02, 0x01, 0x01, 0x05, 0x00]));
    expect(node.tagNumber).toBe(ASN1_TAG.SEQUENCE);
    expect(node.constructed).toBe(true);
    expect(node.children).toHaveLength(2);
    expect(node.children[0].children).toBeNull();
    expect(Array.from(node.children[0].content)).toEqual([1]);
  });

  it('decodes multi-byte long-form lengths', () => {
    const content = new Uint8Array(300).fill(0x41);
    const der = Uint8Array.from([0x04, 0x82, 0x01, 0x2c, ...content]);
    expect(parseAsn1(der).content).toHaveLength(300);
  });

  it('rejects truncated, trailing, indefinite, and over-nested data', () => {
    expect(() => parseAsn1(Uint8Array.from([0x30, 0x0a, 0x02, 0x01]))).toThrow(
      'declares more data than the input contains',
    );
    expect(() => parseAsn1(Uint8Array.from([0x05, 0x00, 0x05, 0x00]))).toThrow(
      'unexpected trailing bytes',
    );
    expect(() => parseAsn1(Uint8Array.from([0x30, 0x80, 0x00, 0x00]))).toThrow(
      'Indefinite DER lengths',
    );
    expect(() => parseAsn1(Uint8Array.from([]))).toThrow('The DER data is empty');
    expect(() => parseAsn1(buildNestedSequences(50))).toThrow('nested too deeply');
    expect(() => parseAsn1(buildNestedSequences(20))).not.toThrow();
  });
});

describe('decodeAsn1String', () => {
  it('decodes UTF8String, BMPString, and PrintableString content', () => {
    const utf8 = { tagNumber: ASN1_TAG.UTF8_STRING, content: Uint8Array.from([0xed, 0x95, 0x9c]) };
    const bmp = { tagNumber: ASN1_TAG.BMP_STRING, content: Uint8Array.from([0x00, 0x41]) };
    const printable = { tagNumber: ASN1_TAG.PRINTABLE_STRING, content: Uint8Array.from([0x42]) };
    expect(decodeAsn1String(utf8)).toBe('한');
    expect(decodeAsn1String(bmp)).toBe('A');
    expect(decodeAsn1String(printable)).toBe('B');
  });
});

describe('getIntegerBitLength', () => {
  it('ignores leading zero padding when counting significant bits', () => {
    expect(getIntegerBitLength(Uint8Array.from([0x00, 0xff]))).toBe(8);
    expect(getIntegerBitLength(Uint8Array.from([0x01, 0x00]))).toBe(9);
    expect(getIntegerBitLength(Uint8Array.from([0x00, 0x00]))).toBe(0);
  });
});

describe('parseCertificate with the RSA sample fixture', () => {
  const certificate = decodeOne(SAMPLE_CERTIFICATE).certificate;

  it('decodes version, serial number, and subject/issuer name equality', () => {
    expect(certificate.version).toBe(3);
    expect(certificate.serialNumber).toBe('18FAA945B4DDE0AC196A1667F165B85D698FC5F7');
    expect(certificate.serialNumberGrouped).toBe(
      '18:FA:A9:45:B4:DD:E0:AC:19:6A:16:67:F1:65:B8:5D:69:8F:C5:F7',
    );
    expect(certificate.subjectMatchesIssuer).toBe(true);
    expect(certificate).not.toHaveProperty('isSelfSigned');
  });

  it('parses subject and issuer distinguished name fields', () => {
    expect(certificate.subject.text).toBe(SAMPLE_DN);
    expect(certificate.issuer.text).toBe(SAMPLE_DN);
    expect(certificate.subject.commonName).toBe('devtoolkit.example');
    expect(certificate.subject.organization).toBe('Dev Toolkit');
    expect(certificate.subject.organizationalUnit).toBe('Engineering');
    expect(certificate.subject.country).toBe('KR');
    expect(certificate.subject.state).toBe('Seoul');
    expect(certificate.subject.locality).toBe('Gangnam');
    expect(certificate.subject.fields[0]).toEqual({
      oid: '2.5.4.6',
      shortName: 'C',
      name: 'countryName',
      value: 'KR',
    });
  });

  it('decodes the UTCTime validity window with its raw form', () => {
    expect(certificate.validity.notBefore.raw).toBe('260812040820Z');
    expect(certificate.validity.notBefore.utc).toBe('2026-08-12T04:08:20Z');
    expect(certificate.validity.notAfter.utc).toBe('2036-08-09T04:08:20Z');
    expect(certificate.validity.notAfter.date.getTime()).toBe(Date.UTC(2036, 7, 9, 4, 8, 20));
  });

  it('resolves the signature algorithm and RSA key size', () => {
    expect(certificate.signatureAlgorithm).toEqual({
      oid: '1.2.840.113549.1.1.11',
      name: 'sha256WithRSAEncryption',
    });
    expect(certificate.publicKey.algorithm).toBe('RSA');
    expect(certificate.publicKey.keySize).toBe(2048);
    expect(certificate.publicKey.curve).toBeNull();
  });

  it('parses every subject alternative name type present', () => {
    expect(certificate.extensions.subjectAltNames).toEqual([
      { type: 'DNS', value: 'devtoolkit.example' },
      { type: 'DNS', value: 'www.devtoolkit.example' },
      { type: 'IP', value: '127.0.0.1' },
      { type: 'Email', value: 'dev@devtoolkit.example' },
    ]);
  });

  it('reports basic constraints and resolves known extension OIDs', () => {
    expect(certificate.extensions.basicConstraints).toEqual({ isCa: true, pathLength: null });
    expect(certificate.extensions.all.map((extension) => extension.name)).toEqual([
      'subjectKeyIdentifier',
      'authorityKeyIdentifier',
      'subjectAltName',
      'basicConstraints',
    ]);
    expect(
      certificate.extensions.all.find((extension) => extension.name === 'basicConstraints')
        ?.critical,
    ).toBe(true);
  });
});

describe('parseCertificate with the EC fixture', () => {
  it('derives the curve and key size from the named-curve parameter', () => {
    const { publicKey, signatureAlgorithm } = decodeOne(EC_CERTIFICATE).certificate;
    expect(signatureAlgorithm.name).toBe('ecdsa-with-SHA256');
    expect(publicKey.algorithm).toBe('EC');
    expect(publicKey.curveOid).toBe('1.2.840.10045.3.1.7');
    expect(publicKey.curve).toBe('prime256v1 (P-256)');
    expect(publicKey.keySize).toBe(256);
  });
});

describe('parseCertificate with the GeneralizedTime fixture', () => {
  it('decodes four-digit-year validity fields', () => {
    const { validity } = decodeOne(NOT_YET_VALID_CERTIFICATE).certificate;
    expect(validity.notBefore.raw).toBe('20900101000000Z');
    expect(validity.notBefore.utc).toBe('2090-01-01T00:00:00Z');
    expect(validity.notAfter.utc).toBe('2091-01-01T00:00:00Z');
  });
});

describe('getValidityStatus', () => {
  const sample = decodeOne(SAMPLE_CERTIFICATE).certificate;
  const expired = decodeOne(EXPIRED_CERTIFICATE).certificate;
  const future = decodeOne(NOT_YET_VALID_CERTIFICATE).certificate;

  it('flags an expired certificate against the current time', () => {
    const status = getValidityStatus(expired.validity);
    expect(status.status).toBe('expired');
    expect(status.isExpired).toBe(true);
    expect(status.isNotYetValid).toBe(false);
    expect(status.millisecondsUntilExpiry).toBeLessThan(0);
  });

  it('flags a not-yet-valid certificate against the current time', () => {
    const status = getValidityStatus(future.validity);
    expect(status.status).toBe('not-yet-valid');
    expect(status.isNotYetValid).toBe(true);
    expect(status.millisecondsUntilValid).toBeGreaterThan(0);
  });

  it('reports a certificate inside its window as valid', () => {
    const status = getValidityStatus(sample.validity, Date.UTC(2030, 0, 1));
    expect(status.status).toBe('valid');
    expect(status.isExpired).toBe(false);
    expect(status.isNotYetValid).toBe(false);
  });

  it('treats the exact boundary instants as still valid', () => {
    const notBefore = sample.validity.notBefore.date.getTime();
    const notAfter = sample.validity.notAfter.date.getTime();
    expect(getValidityStatus(sample.validity, notBefore).status).toBe('valid');
    expect(getValidityStatus(sample.validity, notAfter).status).toBe('valid');
    expect(getValidityStatus(sample.validity, notBefore - 1).status).toBe('not-yet-valid');
    expect(getValidityStatus(sample.validity, notAfter + 1).status).toBe('expired');
  });
});

describe('decodeAsn1Time', () => {
  const utcTime = (text) => decodeAsn1Time(timeNode(ASN1_TAG.UTC_TIME, text));
  const generalizedTime = (text) => decodeAsn1Time(timeNode(ASN1_TAG.GENERALIZED_TIME, text));

  it('decodes in-range UTCTime and GeneralizedTime values', () => {
    expect(utcTime('260812040820Z').utc).toBe('2026-08-12T04:08:20Z');
    expect(generalizedTime('20900101000000Z').utc).toBe('2090-01-01T00:00:00Z');
  });

  it('applies a numeric zone offset to reach UTC', () => {
    expect(utcTime('260812040820+0900').utc).toBe('2026-08-11T19:08:20Z');
    expect(utcTime('260812040820-0230').utc).toBe('2026-08-12T06:38:20Z');
  });

  it('rejects out-of-range calendar fields instead of normalising them', () => {
    // `Date.UTC()` would turn each of these into a different, valid instant.
    expect(() => utcTime('261312040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260012040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260832040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260800040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260812250820Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260812046020Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260812040860Z')).toThrow('is not a valid ASN.1 time value');
  });

  it('rejects a day beyond the actual length of its month', () => {
    expect(() => utcTime('260431040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260229040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(utcTime('260430040820Z').utc).toBe('2026-04-30T04:08:20Z');
    // 2024 is a leap year; 2100 is not, despite being divisible by four.
    expect(utcTime('240229040820Z').utc).toBe('2024-02-29T04:08:20Z');
    expect(() => generalizedTime('21000229040820Z')).toThrow('is not a valid ASN.1 time value');
    expect(generalizedTime('20000229040820Z').utc).toBe('2000-02-29T04:08:20Z');
  });

  it('rejects an out-of-range zone offset', () => {
    expect(() => utcTime('260812040820+2400')).toThrow('is not a valid ASN.1 time value');
    expect(() => utcTime('260812040820-0060')).toThrow('is not a valid ASN.1 time value');
  });

  it('keeps a sub-100 GeneralizedTime year literal rather than remapping it to the 1900s', () => {
    expect(generalizedTime('00500101000000Z').utc).toBe('0050-01-01T00:00:00Z');
  });
});

describe('decodeCertificates', () => {
  it('decodes a concatenated chain and indexes each block', () => {
    const results = decodeCertificates(`${SAMPLE_CERTIFICATE}\n${EC_CERTIFICATE}`);
    expect(results).toHaveLength(2);
    expect(results[0].index).toBe(0);
    expect(results[0].certificate.subject.commonName).toBe('devtoolkit.example');
    expect(results[1].certificate.subject.commonName).toBe('ec.example');
  });

  it('rejects empty input and text without certificate armour', () => {
    expect(() => decodeCertificates('   ')).toThrow('Paste a PEM-encoded certificate');
    expect(() => decodeCertificates(null)).toThrow('Paste a PEM-encoded certificate');
    expect(() => decodeCertificates('hello world')).toThrow('No PEM certificate found');
    expect(() => decodeCertificates('-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----'))
      .toThrow('No PEM certificate found');
  });

  it('reports truncated Base64 as a per-block error instead of throwing', () => {
    const entry = decodeOne(toPem(bodyOf(SAMPLE_CERTIFICATE).slice(0, 199)));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('not valid Base64 data');
  });

  it('reports corrupt DER as a per-block error instead of throwing', () => {
    const entry = decodeOne(toPem(bodyOf(SAMPLE_CERTIFICATE).slice(0, 200)));
    expect(entry.error).toMatch('declares more data than the input contains');
  });

  it('reports well-formed DER that is not a certificate as a per-block error', () => {
    // `MAUCAQEFAA==` is SEQUENCE { INTEGER 1, NULL } - valid DER, wrong shape.
    const entry = decodeOne(toPem('MAUCAQEFAA=='));
    expect(entry.error).toMatch('missing its signature fields');
  });

  it('keeps decoding the remaining blocks when one block is corrupt', () => {
    const results = decodeCertificates(`${toPem('MAUCAQEFAA==')}\n${SAMPLE_CERTIFICATE}`);
    expect(results[0].error).toBeDefined();
    expect(results[1].certificate.subject.commonName).toBe('devtoolkit.example');
  });
});

describe('parseCertificate error handling', () => {
  const sampleDer = decodeBase64ToBytes(bodyOf(SAMPLE_CERTIFICATE));

  it('rejects DER whose outer element is not a SEQUENCE', () => {
    expect(() => parseCertificate(Uint8Array.from([0x05, 0x00]))).toThrow(
      'The certificate is not a valid DER SEQUENCE',
    );
  });

  it('rejects a primitive-form SEQUENCE tag instead of failing on its absent children', () => {
    expect(() => parseCertificate(Uint8Array.from([0x10, 0x00]))).toThrow(
      'The certificate is not a valid DER SEQUENCE',
    );
  });

  it('decodes the untouched sample fixture, so the mutations below are the only change', () => {
    expect(parseCertificate(sampleDer).subject.commonName).toBe('devtoolkit.example');
  });

  it('rejects a certificate that stops before its signature fields', () => {
    const outer = parseAsn1(sampleDer);
    const truncated = encodeSequence(
      sampleDer.subarray(outer.children[0].start, outer.children[0].end),
    );
    expect(() => parseCertificate(truncated)).toThrow(
      'The certificate is missing its signature fields',
    );
  });

  it('rejects a signatureValue whose tag is not BIT STRING', () => {
    const mutated = Uint8Array.from(sampleDer);
    // Retag only the third top-level field, from BIT STRING (0x03) to NULL.
    mutated[parseAsn1(sampleDer).children[2].start] = ASN1_TAG.NULL;
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate signature value is not a valid DER BIT STRING',
    );
  });

  it('rejects a signatureValue with an invalid unused-bit count', () => {
    const mutated = Uint8Array.from(sampleDer);
    const signature = parseAsn1(sampleDer).children[2];
    mutated[signature.end - signature.content.length] = 0x08;
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate signature value declares an invalid unused-bit count',
    );
  });

  it('rejects a signatureValue whose declared unused bits are not zero', () => {
    const mutated = Uint8Array.from(sampleDer);
    const signature = parseAsn1(sampleDer).children[2];
    const unusedBitCountOffset = signature.end - signature.content.length;
    // The final signature octet is 0x4F, so its low-order bit is set: declaring
    // one unused bit contradicts the content DER requires it to describe.
    expect(mutated[unusedBitCountOffset]).toBe(0x00);
    expect(mutated[signature.end - 1] & 0x01).toBe(0x01);
    mutated[unusedBitCountOffset] = 0x01;
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate signature value declares unused bits that are not zero',
    );
  });

  it('reports non-zero unused signature bits as a per-block decode error', () => {
    const mutated = Uint8Array.from(sampleDer);
    const signature = parseAsn1(sampleDer).children[2];
    mutated[signature.end - signature.content.length] = 0x01;
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch(
      'The certificate signature value declares unused bits that are not zero',
    );
  });

  it('rejects a content-free signatureValue that still declares unused bits', () => {
    const certificate = parseAsn1(sampleDer);
    const mutated = encodeSequence(
      concatBytes([
        certificate.children[0].raw,
        certificate.children[1].raw,
        // BIT STRING with one unused bit but no content octet to take it from.
        Uint8Array.from([ASN1_TAG.BIT_STRING, 0x01, 0x01]),
      ]),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate signature value declares unused bits but carries no content octets',
    );
  });

  it('accepts a content-free signatureValue that declares zero unused bits', () => {
    const certificate = parseAsn1(sampleDer);
    const mutated = encodeSequence(
      concatBytes([
        certificate.children[0].raw,
        certificate.children[1].raw,
        Uint8Array.from([ASN1_TAG.BIT_STRING, 0x01, 0x00]),
      ]),
    );
    expect(parseCertificate(mutated).subject.commonName).toBe('devtoolkit.example');
  });

  it('rejects a subject public key whose declared unused bits are not zero', () => {
    const mutated = Uint8Array.from(sampleDer);
    const tbs = parseAsn1(sampleDer).children[0];
    const keyBits = tbs.children[tbsVersionFields(sampleDer) + 5].children[1];
    const unusedBitCountOffset = keyBits.end - keyBits.content.length;
    expect(mutated[keyBits.end - 1] & 0x01).toBe(0x01);
    mutated[unusedBitCountOffset] = 0x01;
    expect(() => parseCertificate(mutated)).toThrow(
      'The subject public key declares unused bits that are not zero',
    );
  });

  it('rejects superfluous fields after the signature value', () => {
    const outer = parseAsn1(sampleDer);
    const extended = encodeSequence(
      Uint8Array.from([...sampleDer.subarray(outer.children[0].start, outer.end), 0x05, 0x00]),
    );
    expect(() => parseCertificate(extended)).toThrow(
      'unexpected fields after its signature value',
    );
  });

  it('rejects a signed body whose signature field is not a SEQUENCE', () => {
    const mutated = Uint8Array.from(sampleDer);
    // Retag only the AlgorithmIdentifier inside tbsCertificate, SEQUENCE to NULL.
    mutated[tbsSignatureField(sampleDer).start] = ASN1_TAG.NULL;
    expect(() => parseCertificate(mutated)).toThrow(
      'The signed certificate body signature algorithm is not a valid DER SEQUENCE',
    );
  });

  it('rejects a signed body whose signature field starts with a non-OID', () => {
    const mutated = Uint8Array.from(sampleDer);
    mutated[tbsSignatureField(sampleDer).children[0].start] = ASN1_TAG.NULL;
    expect(() => parseCertificate(mutated)).toThrow(
      'The signed certificate body signature algorithm OID is not a valid DER OBJECT IDENTIFIER',
    );
  });

  it('rejects a signed body whose signature algorithm differs from the outer one', () => {
    const mutated = Uint8Array.from(sampleDer);
    const oid = tbsSignatureField(sampleDer).children[0];
    // sha256WithRSAEncryption ends in 11; 13 is sha512WithRSAEncryption.
    mutated[oid.end - 1] = 13;
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate body signature algorithm does not match the outer signature algorithm',
    );
  });

  it('rejects a signed body whose algorithm parameters differ from the outer ones', () => {
    const mutated = Uint8Array.from(sampleDer);
    const parameters = tbsSignatureField(sampleDer).children[1];
    // Same sha256WithRSAEncryption OID on both sides; only the tbsCertificate
    // parameters change, from NULL to an equally long empty OCTET STRING.
    expect(Array.from(parameters.raw)).toEqual([ASN1_TAG.NULL, 0x00]);
    mutated[parameters.start] = ASN1_TAG.OCTET_STRING;
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate body signature algorithm does not match the outer signature algorithm',
    );
  });

  it('reports mismatched signature algorithm parameters as a per-block decode error', () => {
    const mutated = Uint8Array.from(sampleDer);
    mutated[tbsSignatureField(sampleDer).children[1].start] = ASN1_TAG.OCTET_STRING;
    const entry = decodeOne(toPem(btoa(String.fromCharCode(...mutated))));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch(
      'The certificate body signature algorithm does not match the outer signature algorithm',
    );
  });

  it('re-encodes the sample certificate unchanged when no surplus field is added', () => {
    expect(Array.from(withSurplusSignatureFields(sampleDer))).toEqual(Array.from(sampleDer));
  });

  it('rejects an outer signature algorithm with fields after its parameters', () => {
    expect(() => parseCertificate(withSurplusSignatureFields(sampleDer, { outer: true }))).toThrow(
      'The signature algorithm has unexpected fields after its parameters',
    );
  });

  it('rejects a signed body signature algorithm with fields after its parameters', () => {
    expect(() => parseCertificate(withSurplusSignatureFields(sampleDer, { body: true }))).toThrow(
      'The signed certificate body signature algorithm has unexpected fields after its parameters',
    );
  });

  it('rejects equally padded signature algorithms that DER equality alone would accept', () => {
    // Both identifiers gain the same surplus field, so they stay byte-equal and
    // only the per-identifier shape check can reject them.
    const mutated = withSurplusSignatureFields(sampleDer, { body: true, outer: true });
    const outerAlgorithm = parseAsn1(mutated).children[1];
    expect(Array.from(outerAlgorithm.raw)).toEqual(Array.from(tbsSignatureField(mutated).raw));
    expect(outerAlgorithm.children).toHaveLength(3);
    expect(() => parseCertificate(mutated)).toThrow(
      'The signature algorithm has unexpected fields after its parameters',
    );
  });

  it('reports a surplus signature algorithm field as a per-block decode error', () => {
    const mutated = withSurplusSignatureFields(sampleDer, { body: true, outer: true });
    const entry = decodeOne(toPem(btoa(String.fromCharCode(...mutated))));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch(
      'The signature algorithm has unexpected fields after its parameters',
    );
  });

  it('rejects a public key algorithm with fields after its parameters', () => {
    const certificate = parseAsn1(sampleDer);
    const tbs = certificate.children[0];
    const keyIndex = tbsVersionFields(sampleDer) + 5;
    const keyInfo = tbs.children[keyIndex];
    const paddedKeyInfo = encodeSequence(
      concatBytes([withSurplusField(keyInfo.children[0]), keyInfo.children[1].raw]),
    );
    const tbsContent = tbs.children.map((field, index) =>
      index === keyIndex ? paddedKeyInfo : field.raw,
    );
    const mutated = encodeSequence(
      concatBytes([
        encodeSequence(concatBytes(tbsContent)),
        certificate.children[1].raw,
        certificate.children[2].raw,
      ]),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The public key algorithm has unexpected fields after its parameters',
    );
  });

  it('re-encodes the sample certificate unchanged when its tail is rebuilt as-is', () => {
    const rebuilt = withTbsTail(sampleDer, [tbsExtensionsField(sampleDer).raw]);
    expect(Array.from(rebuilt)).toEqual(Array.from(sampleDer));
  });

  it('accepts the issuer and subject unique identifiers ahead of the extensions', () => {
    const mutated = withTbsTail(sampleDer, [
      uniqueIdField(1),
      uniqueIdField(2),
      tbsExtensionsField(sampleDer).raw,
    ]);
    const certificate = parseCertificate(mutated);
    expect(certificate.subject.commonName).toBe('devtoolkit.example');
    expect(certificate.extensions.subjectAltNames).toHaveLength(4);
  });

  it('accepts a certificate body that omits the optional tail entirely', () => {
    const certificate = parseCertificate(withTbsTail(sampleDer, []));
    expect(certificate.subject.commonName).toBe('devtoolkit.example');
    expect(certificate.extensions.all).toEqual([]);
  });

  it('rejects a field trailing the extensions instead of silently ignoring it', () => {
    // A nine-field tbsCertificate whose first eight fields are untouched: only
    // a scan for the `[3]` wrapper would still read back the right subject.
    const mutated = withTbsTail(sampleDer, [
      tbsExtensionsField(sampleDer).raw,
      Uint8Array.from([ASN1_TAG.NULL, 0x00]),
    ]);
    expect(parseAsn1(mutated).children[0].children).toHaveLength(9);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate body has an unexpected field after its public key',
    );
  });

  it('reports a field trailing the extensions as a per-block decode error', () => {
    const mutated = withTbsTail(sampleDer, [
      tbsExtensionsField(sampleDer).raw,
      Uint8Array.from([ASN1_TAG.NULL, 0x00]),
    ]);
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch(
      'The certificate body has an unexpected field after its public key',
    );
  });

  it('rejects a duplicated extensions wrapper', () => {
    const extensions = tbsExtensionsField(sampleDer).raw;
    expect(() => parseCertificate(withTbsTail(sampleDer, [extensions, extensions]))).toThrow(
      'The certificate body has an unexpected field after its public key',
    );
  });

  it('rejects duplicated unique identifiers', () => {
    expect(() => parseCertificate(withTbsTail(sampleDer, [uniqueIdField(1), uniqueIdField(1)])))
      .toThrow('The certificate body has an unexpected field after its public key');
  });

  it('rejects optional tail fields that appear out of order', () => {
    const mutated = withTbsTail(sampleDer, [
      tbsExtensionsField(sampleDer).raw,
      uniqueIdField(1),
    ]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate body has an unexpected field after its public key',
    );
    expect(() => parseCertificate(withTbsTail(sampleDer, [uniqueIdField(2), uniqueIdField(1)])))
      .toThrow('The certificate body has an unexpected field after its public key');
  });

  it('rejects an unknown context-specific tag in the optional tail', () => {
    const mutated = withTbsTail(sampleDer, [encodeContext(4, new Uint8Array(0))]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate body has an unexpected field after its public key',
    );
  });

  it('rejects optional tail fields encoded in the wrong constructed form', () => {
    // `[1]` and `[2]` are IMPLICIT BIT STRINGs, so DER encodes them as
    // primitive; `[3]` is EXPLICIT, so it is always constructed.
    // A BER-style constructed BIT STRING: well-formed enough to parse, but not
    // the primitive form DER pins IMPLICIT tagging to.
    const constructedUniqueId = encodeContext(
      1,
      encodeTlv(ASN1_TAG.BIT_STRING, Uint8Array.from([0x00, 0xff])),
    );
    expect(() => parseCertificate(withTbsTail(sampleDer, [constructedUniqueId]))).toThrow(
      'The certificate body has an unexpected field after its public key',
    );
    const primitiveExtensions = Uint8Array.from(tbsExtensionsField(sampleDer).raw);
    primitiveExtensions[0] &= ~0x20;
    expect(() => parseCertificate(withTbsTail(sampleDer, [primitiveExtensions]))).toThrow(
      'The certificate body has an unexpected field after its public key',
    );
  });

  it('rejects an extensions wrapper holding more than its extensions SEQUENCE', () => {
    const extensions = tbsExtensionsField(sampleDer);
    const mutated = withTbsTail(sampleDer, [
      encodeContext(3, concatBytes([extensions.content, Uint8Array.from([ASN1_TAG.NULL, 0x00])])),
    ]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate extensions wrapper does not hold exactly one element',
    );
  });

  it('rejects an empty extensions wrapper', () => {
    const mutated = withTbsTail(sampleDer, [encodeContext(3, new Uint8Array(0))]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate extensions wrapper does not hold exactly one element',
    );
  });

  it('rejects a version wrapper holding more than its version INTEGER', () => {
    const certificate = parseAsn1(sampleDer);
    const tbs = certificate.children[0];
    const version = tbs.children[0];
    const tbsContent = tbs.children.map((field, index) =>
      index === 0
        ? encodeContext(0, concatBytes([version.content, Uint8Array.from([ASN1_TAG.NULL, 0x00])]))
        : field.raw,
    );
    const mutated = encodeSequence(
      concatBytes([
        encodeSequence(concatBytes(tbsContent)),
        certificate.children[1].raw,
        certificate.children[2].raw,
      ]),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate version wrapper does not hold exactly one element',
    );
  });

  it('rejects a subject public key info with a surplus field', () => {
    const certificate = parseAsn1(sampleDer);
    const tbs = certificate.children[0];
    const keyIndex = tbsVersionFields(sampleDer) + 5;
    const tbsContent = tbs.children.map((field, index) =>
      index === keyIndex ? withSurplusField(field) : field.raw,
    );
    const mutated = encodeSequence(
      concatBytes([
        encodeSequence(concatBytes(tbsContent)),
        certificate.children[1].raw,
        certificate.children[2].raw,
      ]),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The subject public key info does not hold exactly two fields',
    );
  });

  it('rejects a validity SEQUENCE with a surplus field', () => {
    const certificate = parseAsn1(sampleDer);
    const tbs = certificate.children[0];
    const validityIndex = tbsVersionFields(sampleDer) + 3;
    const tbsContent = tbs.children.map((field, index) =>
      index === validityIndex ? withSurplusField(field) : field.raw,
    );
    const mutated = encodeSequence(
      concatBytes([
        encodeSequence(concatBytes(tbsContent)),
        certificate.children[1].raw,
        certificate.children[2].raw,
      ]),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate validity is not exactly a notBefore and a notAfter',
    );
  });

  it('rejects a notBefore whose month is outside the calendar range', () => {
    // Only the two month characters change: 260812040820Z becomes month 13.
    expect(() => parseCertificate(withNotBefore(sampleDer, '261312040820Z'))).toThrow(
      '"261312040820Z" is not a valid ASN.1 time value',
    );
  });

  it('rejects a notBefore whose day exceeds the length of its month', () => {
    expect(() => parseCertificate(withNotBefore(sampleDer, '260931040820Z'))).toThrow(
      '"260931040820Z" is not a valid ASN.1 time value',
    );
  });

  it('reports an out-of-range notBefore as a per-block decode error', () => {
    const mutated = withNotBefore(sampleDer, '261312040820Z');
    const entry = decodeOne(toPem(btoa(String.fromCharCode(...mutated))));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('"261312040820Z" is not a valid ASN.1 time value');
  });

  it('keeps decoding a chain when only one block has corrupt validity data', () => {
    const mutated = withNotBefore(sampleDer, '261312040820Z');
    const results = decodeCertificates(
      `${toPem(btoa(String.fromCharCode(...mutated)))}\n${SAMPLE_CERTIFICATE}`,
    );
    expect(results[0].error).toMatch('is not a valid ASN.1 time value');
    expect(results[1].certificate.validity.notBefore.utc).toBe('2026-08-12T04:08:20Z');
  });

  it('reports a retagged signatureValue as a per-block decode error', () => {
    const mutated = Uint8Array.from(sampleDer);
    mutated[parseAsn1(sampleDer).children[2].start] = ASN1_TAG.NULL;
    const entry = decodeOne(toPem(btoa(String.fromCharCode(...mutated))));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('not a valid DER BIT STRING');
  });
});

describe('formatting helpers', () => {
  it('groups hexadecimal text into octet pairs', () => {
    expect(formatHexGroups('18FAA9')).toBe('18:FA:A9');
    expect(formatHexGroups('')).toBe('');
  });

  it('formats a UTC timestamp to second precision', () => {
    expect(formatUtc(new Date(Date.UTC(2026, 7, 12, 4, 8, 20, 500)))).toBe('2026-08-12T04:08:20Z');
  });

  it('formats durations as at most two units, ignoring the sign', () => {
    expect(formatDuration(-90_000)).toBe('1 minute 30 seconds');
    expect(formatDuration(0)).toBe('0 seconds');
    expect(formatDuration(31_536_000_000 * 2 + 86_400_000 * 3)).toBe('2 years 3 days');
  });
});

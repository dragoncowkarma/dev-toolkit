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

/** Wraps content bytes in a DER SEQUENCE header, so tests can re-encode input. */
function encodeSequence(content) {
  let header;
  if (content.length < 0x80) header = [0x30, content.length];
  else if (content.length < 0x100) header = [0x30, 0x81, content.length];
  else header = [0x30, 0x82, content.length >> 8, content.length & 0xff];
  return Uint8Array.from([...header, ...content]);
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

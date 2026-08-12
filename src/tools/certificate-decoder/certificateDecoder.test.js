import { describe, expect, it } from 'vitest';
import {
  ASN1_TAG,
  decodeAsn1String,
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
  it('rejects DER whose outer element is not a SEQUENCE', () => {
    expect(() => parseCertificate(Uint8Array.from([0x05, 0x00]))).toThrow(
      'The certificate is not a valid DER SEQUENCE',
    );
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

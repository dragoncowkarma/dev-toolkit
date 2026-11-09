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
  parseName,
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

/**
 * An IMPLICIT `UniqueIdentifier` BIT STRING under the given context tag.
 * `content` defaults to a valid single-octet value declaring no unused bits.
 */
function uniqueIdField(tagNumber, content = [0x00, 0xff]) {
  return encodeTlv(0x80 | tagNumber, Uint8Array.from(content));
}

/**
 * Rebuilds the certificate with `name` replacing its issuer or subject `Name`,
 * re-encoding both enclosing SEQUENCE lengths so every other field and the
 * signature bytes stay byte-identical. Only the chosen name differs.
 */
function withName(der, which, name) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const nameIndex = tbsVersionFields(der) + (which === 'issuer' ? 2 : 4);
  const fields = tbs.children.map((field, index) => (index === nameIndex ? name : field.raw));
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes(fields)),
      certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
}

/** Rebuilds the certificate with its issuer or subject as an empty `SEQUENCE {}`. */
function withEmptyName(der, which) {
  return withName(der, which, encodeSequence(new Uint8Array(0)));
}

/**
 * Rebuilds the certificate with an empty RDN `SET {}` appended to its issuer or
 * subject. Every original RDN is preserved, so the only defect is the empty set.
 */
function withEmptyRdn(der, which) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const nameIndex = tbsVersionFields(der) + (which === 'issuer' ? 2 : 4);
  const rdns = tbs.children[nameIndex].children.map((rdn) => rdn.raw);
  return withName(
    der,
    which,
    encodeSequence(concatBytes([...rdns, encodeTlv(0x31, new Uint8Array(0))])),
  );
}

/** Encodes text as the content octets of a printable ASN.1 element. */
function asciiBytes(text) {
  return Uint8Array.from(text.split('').map((character) => character.charCodeAt(0)));
}

/**
 * Rebuilds the certificate with `mapExtension` applied to every `Extension`
 * TLV, re-encoding the `Extensions` SEQUENCE, the `[3]` wrapper, and both
 * enclosing SEQUENCE lengths, so only the extension under test differs.
 * A mapper returning `null` leaves that extension untouched.
 */
function withExtensions(der, mapExtension) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const lastIndex = tbs.children.length - 1;
  const extensions = tbs.children[lastIndex].children[0];
  const rebuilt = encodeSequence(
    concatBytes(extensions.children.map((extension) => mapExtension(extension) ?? extension.raw)),
  );
  const head = tbs.children.slice(0, lastIndex).map((field) => field.raw);
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes([...head, encodeContext(3, rebuilt)])),
      certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
}

/**
 * Rebuilds the certificate with every attribute type OID in the first issuer
 * RDN re-encoded with a leading `80` base-128 group, re-encoding the RDN SET,
 * the issuer Name and both enclosing SEQUENCE lengths. The padded OID decodes
 * to the same arcs, so only its canonical form differs.
 */
function withNonMinimalIssuerOid(der) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const issuerIndex = tbsVersionFields(der) + 2;
  const issuer = tbs.children[issuerIndex];
  const rdns = issuer.children.map((rdn, rdnIndex) => {
    if (rdnIndex !== 0) return rdn.raw;
    const attributes = rdn.children.map((attribute) => {
      const [type, value] = attribute.children;
      const padded = encodeTlv(
        ASN1_TAG.OBJECT_IDENTIFIER,
        concatBytes([Uint8Array.from([0x80]), type.content]),
      );
      return encodeSequence(concatBytes([padded, value.raw]));
    });
    return encodeTlv(0x31, concatBytes(attributes));
  });
  const fields = tbs.children.map((field, index) =>
    index === issuerIndex ? encodeSequence(concatBytes(rdns)) : field.raw,
  );
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes(fields)),
      certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
}

/**
 * Rebuilds the certificate with its first `Extension` emitted twice inside the
 * same `[3]` wrapper, re-encoding only the enclosing DER lengths. Both copies
 * are byte-identical, so the only defect is the repeated `extnID`.
 */
function withDuplicatedFirstExtension(der) {
  let duplicated = false;
  return withExtensions(der, (extension) => {
    if (duplicated) return null;
    duplicated = true;
    return concatBytes([extension.raw, extension.raw]);
  });
}

/**
 * Rebuilds the certificate with one surplus `NULL` appended to the first issuer
 * `AttributeTypeAndValue`, re-encoding the RDN SET, the issuer Name and both
 * enclosing SEQUENCE lengths. Its type and value are untouched, so the only
 * defect is the extra field.
 */
function withSurplusIssuerAttributeField(der) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const issuerIndex = tbsVersionFields(der) + 2;
  const issuer = tbs.children[issuerIndex];
  const rdns = issuer.children.map((rdn, rdnIndex) => {
    if (rdnIndex !== 0) return rdn.raw;
    return encodeTlv(
      0x31,
      concatBytes(
        rdn.children.map((attribute, index) =>
          index === 0 ? withSurplusField(attribute) : attribute.raw,
        ),
      ),
    );
  });
  const fields = tbs.children.map((field, index) =>
    index === issuerIndex ? encodeSequence(concatBytes(rdns)) : field.raw,
  );
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes(fields)),
      certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
}

/** Rebuilds the sample certificate with `value` as the basicConstraints extnValue. */
function withBasicConstraintsValue(der, value) {
  return withExtensions(der, (extension) => {
    if (extensionOid(extension) !== '2.5.29.19') return null;
    return encodeSequence(
      concatBytes([
        extension.children[0].raw,
        extension.children[1].raw,
        encodeTlv(ASN1_TAG.OCTET_STRING, value),
      ]),
    );
  });
}

/** Reads an `Extension`'s `extnID` so a mutation can target one extension. */
function extensionOid(extension) {
  return decodeOid(extension.children[0].content);
}

/**
 * Rebuilds the certificate with `notBefore` replaced by a freshly encoded time
 * element, so the replacement may differ in length from the original.
 */
function withNotBeforeElement(der, tag, text) {
  const certificate = parseAsn1(der);
  const tbs = certificate.children[0];
  const validityIndex = tbsVersionFields(der) + 3;
  const validity = tbs.children[validityIndex];
  const rebuiltValidity = encodeSequence(
    concatBytes([encodeTlv(tag, asciiBytes(text)), validity.children[1].raw]),
  );
  const fields = tbs.children.map((field, index) =>
    index === validityIndex ? rebuiltValidity : field.raw,
  );
  return encodeSequence(
    concatBytes([
      encodeSequence(concatBytes(fields)),
      certificate.children[1].raw,
      certificate.children[2].raw,
    ]),
  );
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

  it('rejects a base-128 group padded with a leading zero payload octet', () => {
    // `80 55 04 06` decodes to the same arcs as the canonical `55 04 06`, so
    // only the non-minimal encoding distinguishes the two.
    expect(() => decodeOid(Uint8Array.from([0x80, 0x55, 0x04, 0x06]))).toThrow(
      'is not minimally encoded',
    );
    // A subidentifier after the first is held to the same rule.
    expect(() => decodeOid(Uint8Array.from([0x55, 0x80, 0x04]))).toThrow(
      'is not minimally encoded',
    );
    // A lone `80` is a padded group that never terminates.
    expect(() => decodeOid(Uint8Array.from([0x80]))).toThrow('is not minimally encoded');
    // `81 00` is a legitimate 128 and `86 48` a legitimate continuation.
    expect(decodeOid(Uint8Array.from([0x55, 0x81, 0x00]))).toBe('2.5.128');
    expect(decodeOid(Uint8Array.from([0x2a, 0x86, 0x48]))).toBe('1.2.840');
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

  it('rejects a long-form length that encodes a value below 128', () => {
    // `81 05` and `05` describe the same five content octets; only the latter is DER.
    const content = new Uint8Array(5).fill(0x41);
    expect(() => parseAsn1(Uint8Array.from([0x04, 0x81, 0x05, ...content]))).toThrow(
      'A DER length below 128 must use the short form',
    );
    expect(() => parseAsn1(Uint8Array.from([0x04, 0x81, 0x7f, ...new Uint8Array(127)]))).toThrow(
      'A DER length below 128 must use the short form',
    );
    // 128 is the smallest length the long form is allowed to carry.
    expect(parseAsn1(Uint8Array.from([0x04, 0x81, 0x80, ...new Uint8Array(128)])).content)
      .toHaveLength(128);
  });

  it('rejects a long-form length with a leading zero octet', () => {
    const content = new Uint8Array(200).fill(0x41);
    expect(() => parseAsn1(Uint8Array.from([0x04, 0x82, 0x00, 0xc8, ...content]))).toThrow(
      'A DER length has a leading zero octet',
    );
  });

  it('rejects a high-tag-number identifier that a single octet could encode', () => {
    // `3F 10` spells SEQUENCE the long way round; DER admits only `30`.
    expect(() => parseAsn1(Uint8Array.from([0x3f, 0x10, 0x00]))).toThrow(
      'A DER tag number below 31 must use the low-tag-number form',
    );
    expect(() => parseAsn1(Uint8Array.from([0x1f, 0x1e, 0x00]))).toThrow(
      'A DER tag number below 31 must use the low-tag-number form',
    );
    // Tag number 31 is the smallest the high-tag-number form may carry.
    expect(parseAsn1(Uint8Array.from([0x1f, 0x1f, 0x00])).tagNumber).toBe(31);
  });

  it('rejects a high-tag-number identifier padded with a leading zero octet', () => {
    expect(() => parseAsn1(Uint8Array.from([0x3f, 0x80, 0x20, 0x00]))).toThrow(
      'A DER tag number has a leading zero octet',
    );
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

  it('rejects a root header rewritten into the high-tag-number form', () => {
    // Only the identifier octet changes: 30 82 04 28 becomes 3F 10 82 04 28,
    // leaving every content octet of the certificate exactly as it was.
    const mutated = concatBytes([Uint8Array.from([0x3f, 0x10]), sampleDer.subarray(1)]);
    expect(() => parseCertificate(mutated)).toThrow(
      'A DER tag number below 31 must use the low-tag-number form',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('must use the low-tag-number form');
  });

  it('rejects a non-minimal long-form length on the root header', () => {
    const contentStart = sampleDer.length - parseAsn1(sampleDer).content.length;
    const mutated = concatBytes([
      Uint8Array.from([0x30, 0x83, 0x00]),
      sampleDer.subarray(2, contentStart),
      sampleDer.subarray(contentStart),
    ]);
    expect(() => parseCertificate(mutated)).toThrow('A DER length has a leading zero octet');
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('leading zero octet');
  });

  it('rejects an extension criticality BOOLEAN encoded as 01 instead of FF', () => {
    const mutated = withExtensions(sampleDer, (extension) => {
      if (extension.children.length !== 3) return null;
      return encodeSequence(
        concatBytes([
          extension.children[0].raw,
          Uint8Array.from([ASN1_TAG.BOOLEAN, 0x01, 0x01]),
          extension.children[2].raw,
        ]),
      );
    });
    expect(() => parseCertificate(mutated)).toThrow('criticality is not a valid DER BOOLEAN');
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('is not a valid DER BOOLEAN');
  });

  it('rejects a basicConstraints CA BOOLEAN encoded as 01 instead of FF', () => {
    const mutated = withExtensions(sampleDer, (extension) => {
      if (extensionOid(extension) !== '2.5.29.19') return null;
      const value = encodeSequence(Uint8Array.from([ASN1_TAG.BOOLEAN, 0x01, 0x01]));
      return encodeSequence(
        concatBytes([
          extension.children[0].raw,
          extension.children[1].raw,
          encodeTlv(ASN1_TAG.OCTET_STRING, value),
        ]),
      );
    });
    expect(() => parseCertificate(mutated)).toThrow(
      'The basicConstraints CA flag is not a valid DER BOOLEAN',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('CA flag is not a valid DER BOOLEAN');
  });

  it('rejects an issuer attribute OID with a non-minimal base-128 group', () => {
    const mutated = withNonMinimalIssuerOid(sampleDer);
    expect(() => parseCertificate(mutated)).toThrow(
      'An OBJECT IDENTIFIER subidentifier is not minimally encoded',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('is not minimally encoded');
  });

  it('rejects a repeated extension OID instead of letting the last copy win', () => {
    const mutated = withDuplicatedFirstExtension(sampleDer);
    const firstOid = extensionOid(tbsExtensionsField(sampleDer).children[0].children[0]);
    expect(firstOid).toBe('2.5.29.14');
    expect(() => parseCertificate(mutated)).toThrow(
      'Extension 2.5.29.14 appears more than once',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('appears more than once');
  });

  it('rejects a repeated subjectAltName whose last copy would change the result', () => {
    const duplicate = withExtensions(sampleDer, (extension) =>
      extensionOid(extension) === '2.5.29.17'
        ? concatBytes([extension.raw, extension.raw])
        : null,
    );
    expect(() => parseCertificate(duplicate)).toThrow(
      'Extension 2.5.29.17 appears more than once',
    );
    expect(decodeOne(toPemFromDer(duplicate)).error).toMatch('appears more than once');
  });

  it('rejects an issuer attribute carrying a surplus field after its value', () => {
    const mutated = withSurplusIssuerAttributeField(sampleDer);
    expect(() => parseCertificate(mutated)).toThrow(
      'The issuer name attribute has more fields than its type and value',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('has more fields than its type and value');
  });

  it('rejects an empty Name directly, since RDNSequence is SIZE (1..MAX)', () => {
    const empty = parseAsn1(encodeSequence(new Uint8Array(0)));
    expect(() => parseName(empty, 'The issuer name')).toThrow(
      'The issuer name holds no relative distinguished names',
    );
  });

  it('rejects an empty RDN directly, since each RDN is a non-empty SET', () => {
    const name = encodeSequence(encodeTlv(0x31, new Uint8Array(0)));
    expect(() => parseName(parseAsn1(name), 'The subject name')).toThrow(
      'The subject name component holds no attributes',
    );
  });

  it('rejects an empty issuer Name instead of reporting an identity-free issuer', () => {
    const mutated = withEmptyName(sampleDer, 'issuer');
    expect(parseAsn1(mutated).children[0].children[tbsVersionFields(mutated) + 2].children)
      .toHaveLength(0);
    expect(() => parseCertificate(mutated)).toThrow(
      'The issuer name holds no relative distinguished names',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('holds no relative distinguished names');
  });

  it('rejects an empty subject Name instead of reporting an identity-free subject', () => {
    const mutated = withEmptyName(sampleDer, 'subject');
    expect(() => parseCertificate(mutated)).toThrow(
      'The subject name holds no relative distinguished names',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('holds no relative distinguished names');
  });

  it('rejects an empty RDN SET appended to the issuer Name', () => {
    const mutated = withEmptyRdn(sampleDer, 'issuer');
    expect(() => parseCertificate(mutated)).toThrow(
      'The issuer name component holds no attributes',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('component holds no attributes');
  });

  it('rejects an empty RDN SET appended to the subject Name', () => {
    const mutated = withEmptyRdn(sampleDer, 'subject');
    expect(() => parseCertificate(mutated)).toThrow(
      'The subject name component holds no attributes',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('component holds no attributes');
  });

  it('re-encodes the sample certificate unchanged when a Name is rebuilt as-is', () => {
    const issuer = parseAsn1(sampleDer).children[0].children[tbsVersionFields(sampleDer) + 2];
    expect(Array.from(withName(sampleDer, 'issuer', issuer.raw))).toEqual(Array.from(sampleDer));
  });

  it('rejects an issuerUniqueID declaring an unused-bit count above seven', () => {
    const mutated = withTbsTail(sampleDer, [
      uniqueIdField(1, [0x08, 0xff]),
      tbsExtensionsField(sampleDer).raw,
    ]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate issuer unique ID declares an invalid unused-bit count',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('declares an invalid unused-bit count');
  });

  it('rejects an issuerUniqueID whose declared unused bits are not zero', () => {
    const mutated = withTbsTail(sampleDer, [
      uniqueIdField(1, [0x04, 0xff]),
      tbsExtensionsField(sampleDer).raw,
    ]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate issuer unique ID declares unused bits that are not zero',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('unused bits that are not zero');
  });

  it('rejects an empty issuerUniqueID BIT STRING', () => {
    const mutated = withTbsTail(sampleDer, [uniqueIdField(1, [])]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate issuer unique ID is an empty BIT STRING',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('is an empty BIT STRING');
  });

  it('rejects an issuerUniqueID declaring unused bits with no content octets', () => {
    const mutated = withTbsTail(sampleDer, [uniqueIdField(1, [0x03])]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate issuer unique ID declares unused bits but carries no content octets',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('carries no content octets');
  });

  it('rejects a subjectUniqueID with an invalid unused-bit count', () => {
    const mutated = withTbsTail(sampleDer, [
      uniqueIdField(1),
      uniqueIdField(2, [0x09, 0x00]),
      tbsExtensionsField(sampleDer).raw,
    ]);
    expect(() => parseCertificate(mutated)).toThrow(
      'The certificate subject unique ID declares an invalid unused-bit count',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('The certificate subject unique ID');
  });

  it('accepts a unique identifier that declares non-zero unused bits correctly', () => {
    const mutated = withTbsTail(sampleDer, [
      uniqueIdField(1, [0x04, 0xf0]),
      tbsExtensionsField(sampleDer).raw,
    ]);
    expect(parseCertificate(mutated).subject.commonName).toBe('devtoolkit.example');
  });

  it('rejects basicConstraints carrying a surplus field after cA', () => {
    const mutated = withBasicConstraintsValue(
      sampleDer,
      encodeSequence(
        concatBytes([
          Uint8Array.from([ASN1_TAG.BOOLEAN, 0x01, 0xff]),
          Uint8Array.from([ASN1_TAG.NULL, 0x00]),
        ]),
      ),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The basicConstraints extension is not exactly an optional cA BOOLEAN',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('not exactly an optional cA BOOLEAN');
  });

  it('rejects basicConstraints with a duplicated cA BOOLEAN', () => {
    const mutated = withBasicConstraintsValue(
      sampleDer,
      encodeSequence(Uint8Array.from([ASN1_TAG.BOOLEAN, 0x01, 0xff, ASN1_TAG.BOOLEAN, 0x01, 0xff])),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'followed by an optional pathLenConstraint INTEGER',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('pathLenConstraint INTEGER');
  });

  it('rejects basicConstraints whose pathLenConstraint precedes cA', () => {
    const mutated = withBasicConstraintsValue(
      sampleDer,
      encodeSequence(Uint8Array.from([ASN1_TAG.INTEGER, 0x01, 0x00, ASN1_TAG.BOOLEAN, 0x01, 0xff])),
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'The basicConstraints extension is not exactly an optional cA BOOLEAN',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('not exactly an optional cA BOOLEAN');
  });

  it('accepts basicConstraints carrying cA followed by pathLenConstraint', () => {
    const mutated = withBasicConstraintsValue(
      sampleDer,
      encodeSequence(Uint8Array.from([ASN1_TAG.BOOLEAN, 0x01, 0xff, ASN1_TAG.INTEGER, 0x01, 0x03])),
    );
    expect(parseCertificate(mutated).extensions.basicConstraints).toEqual({
      isCa: true,
      pathLength: 3,
    });
  });

  it('rejects an Extension carrying a fourth field after extnValue', () => {
    const mutated = withExtensions(sampleDer, (extension) =>
      extensionOid(extension) === '2.5.29.19' ? withSurplusField(extension) : null,
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'Extension 2.5.29.19 has more fields than an X.509 extension allows',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('has more fields than an X.509 extension allows');
  });

  it('rejects a non-critical Extension carrying a surplus third field', () => {
    const mutated = withExtensions(sampleDer, (extension) =>
      extension.children.length === 2 ? withSurplusField(extension) : null,
    );
    expect(() => parseCertificate(mutated)).toThrow(
      'has more fields than an X.509 extension allows',
    );
  });

  it('rejects a notBefore carrying a numeric zone offset instead of Zulu time', () => {
    const mutated = withNotBeforeElement(sampleDer, ASN1_TAG.UTC_TIME, '260812040820+0900');
    expect(() => parseCertificate(mutated)).toThrow(
      '"260812040820+0900" is not an RFC 5280 certificate time',
    );
    const entry = decodeOne(toPemFromDer(mutated));
    expect(entry.certificate).toBeUndefined();
    expect(entry.error).toMatch('is not an RFC 5280 certificate time');
  });

  it('rejects a notBefore that omits the mandatory seconds field', () => {
    const mutated = withNotBeforeElement(sampleDer, ASN1_TAG.UTC_TIME, '2608120408Z');
    expect(() => parseCertificate(mutated)).toThrow(
      '"2608120408Z" is not an RFC 5280 certificate time',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('is not an RFC 5280 certificate time');
  });

  it('rejects a GeneralizedTime notBefore carrying a fractional second', () => {
    const mutated = withNotBeforeElement(
      sampleDer,
      ASN1_TAG.GENERALIZED_TIME,
      '20260812040820.5Z',
    );
    expect(() => parseCertificate(mutated)).toThrow(
      '"20260812040820.5Z" is not an RFC 5280 certificate time',
    );
    expect(decodeOne(toPemFromDer(mutated)).error).toMatch('is not an RFC 5280 certificate time');
  });

  it('still accepts the profile-conformant UTCTime and GeneralizedTime forms', () => {
    // The control for the three rejections above: only the time text differs.
    const utc = withNotBeforeElement(sampleDer, ASN1_TAG.UTC_TIME, '260812040820Z');
    expect(parseCertificate(utc).validity.notBefore.utc).toBe('2026-08-12T04:08:20Z');
    const generalized = withNotBeforeElement(
      sampleDer,
      ASN1_TAG.GENERALIZED_TIME,
      '20260812040820Z',
    );
    expect(parseCertificate(generalized).validity.notBefore.utc).toBe('2026-08-12T04:08:20Z');
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

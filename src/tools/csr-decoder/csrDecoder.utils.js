const MAX_DER_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_CHILDREN = 4096;

const OIDS = {
  '2.5.4.3': 'Common Name', '2.5.4.6': 'Country', '2.5.4.7': 'Locality',
  '2.5.4.8': 'State or Province', '2.5.4.10': 'Organization',
  '2.5.4.11': 'Organizational Unit', '1.2.840.113549.1.9.14': 'Extension Request',
  '2.5.29.17': 'Subject Alternative Name', '2.5.29.19': 'Basic Constraints',
  '2.5.29.15': 'Key Usage', '1.2.840.113549.1.1.1': 'RSA Encryption',
  '1.2.840.10045.2.1': 'EC Public Key', '1.2.840.10045.3.1.7': 'P-256 (prime256v1)',
  '1.3.132.0.34': 'P-384 (secp384r1)', '1.3.132.0.35': 'P-521 (secp521r1)',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
};

export const SAMPLE_RSA_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIIDFDCCAfwCAQAwcjELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAkNBMRYwFAYDVQQH
DA1TYW4gRnJhbmNpc2NvMRQwEgYDVQQKDAtEZXYgVG9vbGtpdDERMA8GA1UECwwI
U2VjdXJpdHkxFTATBgNVBAMMDGV4YW1wbGUudGVzdDCCASIwDQYJKoZIhvcNAQEB
BQADggEPADCCAQoCggEBAIuWutiLYbSJCi3q7tqAhFeYGOwwB2uE+DMuun14z8Me
bUZGOa4QY1eBfL+/PoMwqMlibWz4bD5ShSYX5A1PY/AhCS/KGT8rIfPOAI8Ej8jy
0iRpXPNIhr0crZvCzLUM8R02u68i211+vbwKhg//HWx73s3lFhUmO1iCUETCkGqU
86kx/9zbNavkkFVGijMfEBsssDVwtgH02lYN1HPUZUvu/9pFVSV119v2sInVIIhK
RfTKvkC7zarvvW1vSfeeyEEiOMawSvjXoYk79QkZgXkTGIRV0Ba/WVgCezk7PoK0
Jdrzw8TCtY60Wl6yeq787Q5B99GttkovIz7K3b+/WtcCAwEAAaBdMFsGCSqGSIb3
DQEJDjFOMEwwLwYDVR0RBCgwJoIMZXhhbXBsZS50ZXN0ghB3d3cuZXhhbXBsZS50
ZXN0hwTAAAIBMAwGA1UdEwEB/wQCMAAwCwYDVR0PBAQDAgWgMA0GCSqGSIb3DQEB
CwUAA4IBAQA0O0snb8KdcTcLG/nDicAnHlr6IiYaUHq/yBbHO9vrt1df5JmbnVSN
8RHxK1EsS0ZYp1MtGWHkqSDJE9sdlZXqhUBOSgd5jmVSkluTRAb64FRNFgqGc/n7
/NHxdnPZF8IDvkNDzZ3hcUTe3HPZf9mGIoGUhYR1n6NP3C1fi3VREz3YZRw/OXam
rHZFJrFP+Xv0fGWxVcL+XEcvAHd7QxdcVC1f9OpVkPW+dhePYRpRc6bCC6S3dEtR
ldg9kfDwKDe+fXKY6bN3oZgyDS0D7fEADru6uvbhrKGvvaHiwcqda1UwzSMGOfWb
nVa8FcB+jkdySyNB1XbvcOJl6KWPqojX
-----END CERTIFICATE REQUEST-----`;

export const SAMPLE_ECDSA_CSR = `-----BEGIN NEW CERTIFICATE REQUEST-----
MIIBKzCB0gIBADBAMQswCQYDVQQGEwJHQjEUMBIGA1UECgwLRGV2IFRvb2xraXQx
GzAZBgNVBAMMEmVjZHNhLmV4YW1wbGUudGVzdDBZMBMGByqGSM49AgEGCCqGSM49
AwEHA0IABIsYgO2HHShey7BDhS8XNoE05ekdD49EHfAi8NpYPupUKl7J6mQi3CMh
KWF2wmE/4bhk1tDNpasEQc6f5kgBKjugMDAuBgkqhkiG9w0BCQ4xITAfMB0GA1Ud
EQQWMBSCEmVjZHNhLmV4YW1wbGUudGVzdDAKBggqhkjOPQQDAgNIADBFAiA+yv5a
Xf+OfAKTXSwbDORqOb2b7k6IgikL68ta+vy7SQIhAOVvC9s3QiJdvebXdlIJ5/2f
hcHHiwb8imQl7nyXu1hW
-----END NEW CERTIFICATE REQUEST-----`;

function fail(message) { throw new Error(`Invalid CSR: ${message}`); }
function decodeText(bytes) { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
function requireTag(value, tag, description) {
  if (!value || value.tag !== tag) fail(`expected ${description}`);
  return value;
}
function decodeOid(bytes) {
  if (!bytes.length) fail('empty object identifier');
  const first = bytes[0];
  const values = [first < 80 ? Math.floor(first / 40) : 2, first < 80 ? first % 40 : first - 80];
  let value = 0;
  for (let index = 1; index < bytes.length; index += 1) {
    value = (value * 128) + (bytes[index] & 127);
    if (value > 0x1fffffff) fail('object identifier is too large');
    if (!(bytes[index] & 128)) { values.push(value); value = 0; }
  }
  if (value) fail('truncated object identifier');
  return values.join('.');
}
function readNode(bytes, offset = 0, depth = 0) {
  if (depth > MAX_DEPTH) fail('ASN.1 nesting is too deep');
  if (offset + 2 > bytes.length) fail('truncated ASN.1 value');
  const tag = bytes[offset];
  if ((tag & 31) === 31) fail('high-tag-number ASN.1 values are unsupported');
  let length = bytes[offset + 1];
  let cursor = offset + 2;
  if (length & 128) {
    const count = length & 127;
    if (!count || count > 4 || cursor + count > bytes.length) fail('invalid ASN.1 length');
    length = 0;
    for (let index = 0; index < count; index += 1) length = (length * 256) + bytes[cursor++];
    if (length < 128) fail('non-canonical ASN.1 length');
  }
  const end = cursor + length;
  if (!Number.isSafeInteger(end) || end > bytes.length) fail('truncated ASN.1 content');
  const children = [];
  if (tag & 32) {
    let position = cursor;
    while (position < end) {
      if (children.length >= MAX_CHILDREN) fail('ASN.1 contains too many values');
      const child = readNode(bytes, position, depth + 1);
      children.push(child);
      position = child.end;
    }
  }
  return { tag, value: bytes.slice(cursor, end), children, start: offset, end };
}
function parseAlgorithm(value) {
  const sequence = requireTag(value, 48, 'algorithm identifier');
  const id = decodeOid(requireTag(sequence.children[0], 6, 'algorithm OID').value);
  return { id, name: OIDS[id] || id };
}
function parseSubject(subject) {
  const fields = [];
  for (const set of requireTag(subject, 48, 'subject sequence').children) {
    const pair = requireTag(set, 49, 'relative distinguished name').children[0];
    const id = decodeOid(requireTag(pair?.children[0], 6, 'subject attribute OID').value);
    const value = pair?.children[1];
    if (!value || value.tag === 48 || value.tag === 49) fail('invalid subject attribute value');
    fields.push({ name: OIDS[id] || id, value: decodeText(value.value) });
  }
  return fields;
}
function parseGeneralName(value) {
  if (value.tag === 130) return `DNS:${decodeText(value.value)}`;
  if (value.tag === 134) return `URI:${decodeText(value.value)}`;
  if (value.tag === 135 && value.value.length === 4) {
    return `IP:${Array.from(value.value).join('.')}`;
  }
  return `Tag ${value.tag}: ${decodeText(value.value)}`;
}
function parseKeyUsage(bytes) {
  const bitString = requireTag(readNode(bytes), 3, 'key usage bit string');
  const names = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment',
    'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
  const bits = bitString.value.slice(1);
  return names.filter((name, index) => (bits[Math.floor(index / 8)] ?? 0) & (128 >> (index % 8)))
    .join(', ') || 'None';
}
function parseExtensions(attribute) {
  const values = requireTag(attribute.children[1], 49, 'attribute values');
  const list = requireTag(values.children[0], 48, 'requested extensions');
  return list.children.map((extension) => {
    const sequence = requireTag(extension, 48, 'extension');
    const id = decodeOid(requireTag(sequence.children[0], 6, 'extension OID').value);
    const octet = sequence.children.find((item) => item.tag === 4);
    let value = 'Requested';
    if (id === '2.5.29.17' && octet) {
      value = requireTag(readNode(octet.value), 48, 'subject alternative name').children
        .map(parseGeneralName).join(', ');
    } else if (id === '2.5.29.19' && octet) {
      const basic = requireTag(readNode(octet.value), 48, 'basic constraints');
      const isCertificateAuthority = basic.children.some((item) => item.tag === 1 && item.value[0]);
      value = isCertificateAuthority ? 'CA:TRUE' : 'CA:FALSE';
    } else if (id === '2.5.29.15' && octet) value = parseKeyUsage(octet.value);
    return { name: OIDS[id] || id, value };
  });
}
function pemToBytes(pem) {
  const pemPattern = new RegExp(
    '^\\s*-----BEGIN (?:NEW )?CERTIFICATE REQUEST-----\\s*([A-Za-z0-9+/=\\s]+)\\s*'
      + '-----END (?:NEW )?CERTIFICATE REQUEST-----\\s*$'
  );
  const match = pem.match(pemPattern);
  if (!match) fail('expected one CERTIFICATE REQUEST PEM block');
  const payload = match[1].replace(/\s/g, '');
  if (!payload || payload.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    fail('PEM body is not valid Base64');
  }
  try { return Uint8Array.from(atob(payload), (character) => character.charCodeAt(0)); }
  catch { fail('PEM body is not valid Base64'); }
}

/**
 * Parses a PEM PKCS#10 certificate signing request locally.
 * @param {string} pem PEM-armored CSR text.
 * @returns {object} A display-friendly CSR inspection result.
 * @throws {Error} When the input is malformed or outside safe parser limits.
 */
export function parseCsr(pem) {
  try {
    if (typeof pem !== 'string') fail('input must be PEM text');
    const bytes = pemToBytes(pem);
    if (!bytes.length || bytes.length > MAX_DER_BYTES) fail('DER size is unsupported');
    const root = requireTag(readNode(bytes), 48, 'CSR sequence');
    if (root.end !== bytes.length || root.children.length !== 3) fail('invalid CSR sequence');
    const info = requireTag(root.children[0], 48, 'CertificationRequestInfo');
    if (info.children.length !== 4) fail('invalid CertificationRequestInfo');
    const version = requireTag(info.children[0], 2, 'CSR version');
    if (version.value.length !== 1) fail('unsupported CSR version encoding');
    const versionNumber = version.value[0];
    const subject = parseSubject(info.children[1]);
    const publicKeyInfo = requireTag(info.children[2], 48, 'subject public key info');
    const publicKeyAlgorithm = parseAlgorithm(publicKeyInfo.children[0]);
    const bitString = requireTag(publicKeyInfo.children[1], 3, 'public key bit string');
    if (!bitString.value.length || bitString.value[0] !== 0) fail('invalid public key bit string');
    let keyDetails = 'Key parameters unavailable';
    if (publicKeyAlgorithm.id === '1.2.840.113549.1.1.1') {
      const rsa = requireTag(readNode(bitString.value.slice(1)), 48, 'RSA public key');
      const modulus = requireTag(rsa.children[0], 2, 'RSA modulus').value;
      keyDetails = `${(modulus.length - (modulus[0] === 0 ? 1 : 0)) * 8} bit RSA key`;
    } else if (publicKeyAlgorithm.id === '1.2.840.10045.2.1') {
      const curve = publicKeyInfo.children[0].children[1];
      if (curve?.tag === 6) { const id = decodeOid(curve.value); keyDetails = OIDS[id] || id; }
    }
    const extensions = [];
    const attributes = [];
    const attributeContainer = info.children[3];
    if (attributeContainer.tag !== 160) fail('expected CSR attributes');
    for (const attribute of attributeContainer.children) {
      const id = decodeOid(requireTag(attribute.children[0], 6, 'attribute OID').value);
      attributes.push(OIDS[id] || id);
      if (id === '1.2.840.113549.1.9.14') extensions.push(...parseExtensions(attribute));
    }
    const rawDer = Array.from(
      bytes.slice(0, 128),
      (byte) => byte.toString(16).padStart(2, '0')
    ).join(' ');
    return {
      version: versionNumber === 0 ? 'v1 (0)' : `Unsupported (${versionNumber})`,
      subject, subjectDn: subject.map((field) => `${field.name}=${field.value}`).join(', '),
      publicKey: { algorithm: publicKeyAlgorithm.name, details: keyDetails },
      extensions, attributes, signatureAlgorithm: parseAlgorithm(root.children[1]).name,
      derBytes: bytes.length, rawDer, rawDerTruncated: bytes.length > 128,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid CSR:')) throw error;
    throw new Error('Invalid CSR: malformed PEM or DER data.');
  }
}

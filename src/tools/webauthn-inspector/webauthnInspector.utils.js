import { decodeCbor, parseCborInput } from '../cbor-decoder/cborDecoder.utils.js';
import { parseCoseKey, resolveCoseAlgorithm } from '../cose-inspector/coseInspector.utils.js';

const FLAGS = [['UP', 1], ['UV', 4], ['BE', 8], ['BS', 16], ['AT', 64], ['ED', 128]];
const flagDescriptions = {
  UP: 'User present', UV: 'User verified', BE: 'Backup eligible', BS: 'Backup state',
  AT: 'Attested credential data included', ED: 'Extension data included',
};

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function byteString(node, label) {
  const match = node?.majorType === 2 && /^h'([0-9a-f]*)'$/i.exec(node.value);
  if (!match) throw new Error(`${label} must be a CBOR byte string.`);
  return Uint8Array.from(match[1].match(/../g) ?? [], (item) => Number.parseInt(item, 16));
}

function map(node, label) {
  if (node?.majorType !== 5) throw new Error(`${label} must be a CBOR map.`);
  return new Map(node.entries.map(({ key, value }) => [key.value, value]));
}

function cborLength(bytes) {
  for (let end = 1; end <= bytes.length; end += 1) {
    if (!('error' in decodeCbor(bytes.slice(0, end)))) return end;
  }
  throw new Error('Embedded COSE key is truncated or malformed.');
}

/**
 * Decodes the named WebAuthn authenticator-data bits.
 *
 * @param {number} flags Raw flags byte.
 * @returns {Array<{name: string, set: boolean, description: string}>} Decoded flags.
 */
export function decodeAuthenticatorFlags(flags) {
  return FLAGS.map(([name, bit]) => ({ name, set: (flags & bit) !== 0,
    description: flagDescriptions[name] }));
}

/**
 * Parses a WebAuthn authenticatorData binary structure without verification.
 *
 * @param {Uint8Array} bytes Raw authenticatorData bytes.
 * @returns {object} Parsed display data.
 */
export function parseAuthenticatorData(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 37) {
    throw new Error('authenticatorData is truncated; it requires at least 37 bytes.');
  }
  const flags = bytes[32];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 37;
  const authData = { rpIdHash: hex(bytes.slice(0, 32)), flags: decodeAuthenticatorFlags(flags),
    signCount: view.getUint32(33, false), credential: null, extensions: null };
  if (flags & 64) {
    if (offset + 18 > bytes.length) throw new Error('Attested credential data is truncated.');
    const aaguid = hex(bytes.slice(offset, offset + 16));
    const credentialLength = view.getUint16(offset + 16, false);
    offset += 18;
    if (offset + credentialLength > bytes.length) throw new Error('Credential ID is truncated.');
    const credentialId = bytes.slice(offset, offset + credentialLength);
    offset += credentialLength;
    const keyLength = cborLength(bytes.slice(offset));
    authData.credential = { aaguid, credentialId: hex(credentialId),
      coseKey: parseCoseKey(bytes.slice(offset, offset + keyLength)) };
    offset += keyLength;
  }
  if (flags & 128) {
    const extensions = decodeCbor(bytes.slice(offset));
    if ('error' in extensions || extensions.root.majorType !== 5) {
      throw new Error(`Malformed extension data: ${extensions.error ?? 'expected a CBOR map'}`);
    }
    authData.extensions = extensions.json;
  } else if (offset !== bytes.length) {
    throw new Error('Unexpected trailing authenticatorData bytes.');
  }
  return authData;
}

/**
 * Parses Base64/Base64URL WebAuthn attestationObject or authenticatorData input.
 *
 * @param {string} input Transport-encoded bytes.
 * @param {'attestation'|'authenticatorData'} type Input structure type.
 * @param {'base64'|'base64url'} format Transport encoding.
 * @returns {object} Parsed inspection data.
 */
export function parseWebAuthnInput(input, type, format) {
  const transport = parseCborInput(input, format);
  if ('error' in transport) throw new Error(transport.error);
  if (type === 'authenticatorData') {
    return { type, authData: parseAuthenticatorData(transport.bytes) };
  }
  const decoded = decodeCbor(transport.bytes);
  if ('error' in decoded) throw new Error(`Malformed attestationObject: ${decoded.error}`);
  const root = map(decoded.root, 'attestationObject');
  const fmt = root.get('fmt')?.value;
  if (typeof fmt !== 'string') throw new Error('attestationObject fmt must be a text string.');
  const attStmt = map(root.get('attStmt'), 'attStmt');
  const algorithm = attStmt.get('alg')?.value;
  const certificates = attStmt.get('x5c');
  return {
    type,
    fmt,
    authData: parseAuthenticatorData(byteString(root.get('authData'), 'authData')),
    attStmt: {
      algorithm: typeof algorithm === 'number' ? resolveCoseAlgorithm(algorithm) : null,
      signatureBytes: attStmt.get('sig')?.majorType === 2
        ? byteString(attStmt.get('sig'), 'sig').length : null,
      certificateLengths: certificates?.majorType === 4
        ? certificates.children.map((item) => byteString(item, 'x5c item').length) : [],
    },
  };
}

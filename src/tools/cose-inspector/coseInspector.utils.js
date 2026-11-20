import { decodeCbor, parseCborInput } from '../cbor-decoder/cborDecoder.utils.js';

const MESSAGE_TYPES = new Map([
  [16, 'COSE_Encrypt0'],
  [17, 'COSE_Mac0'],
  [18, 'COSE_Sign1'],
  [96, 'COSE_Encrypt'],
  [97, 'COSE_Mac'],
  [98, 'COSE_Sign'],
]);

const HEADER_NAMES = new Map([
  [1, 'Algorithm'],
  [2, 'Critical'],
  [3, 'Content Type'],
  [4, 'Key ID'],
  [5, 'IV'],
  [6, 'Partial IV'],
  [7, 'Counter Signature'],
  [9, 'Counter Signature 0'],
  [10, 'Type'],
  [11, 'Location'],
]);

const ALGORITHM_NAMES = new Map([
  [-65535, 'RS1'],
  [-259, 'RS512'],
  [-258, 'RS384'],
  [-257, 'RS256'],
  [-47, 'ES256K'],
  [-43, 'SHA-384'],
  [-42, 'SHA-256'],
  [-37, 'PS256'],
  [-8, 'EdDSA'],
  [-7, 'ES256'],
  [-36, 'ES512'],
  [-35, 'ES384'],
  [-38, 'PS384'],
  [-39, 'PS512'],
  [-25, 'ECDH-ES + HKDF-256'],
  [-24, 'ECDH-ES + HKDF-512'],
  [1, 'A128GCM'],
  [2, 'A192GCM'],
  [3, 'A256GCM'],
  [10, 'AES-CCM-16-64-128'],
  [11, 'AES-CCM-16-64-256'],
  [12, 'AES-CCM-64-64-128'],
  [13, 'AES-CCM-64-64-256'],
  [24, 'ChaCha20/Poly1305'],
]);

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function byteStringHex(node) {
  if (node?.majorType !== 2 || typeof node.value !== 'string') return null;
  const match = /^h'([0-9a-f]*)'$/i.exec(node.value);
  return match?.[1] ?? null;
}

function byteStringDetails(node) {
  const hex = byteStringHex(node);
  if (hex === null) return null;
  const bytes = hexToBytes(hex);
  return { hex, base64: bytesToBase64(bytes), byteLength: bytes.length };
}

function nodeValue(node) {
  const bytes = byteStringDetails(node);
  if (bytes) return `h'${bytes.hex}' (${bytes.byteLength} bytes)`;
  if (node?.majorType === 4) return `[${node.children.map(nodeValue).join(', ')}]`;
  if (node?.majorType === 5) {
    const entries = node.entries.map(({ key, value }) => `${nodeValue(key)}: ${nodeValue(value)}`);
    return `{${entries.join(', ')}}`;
  }
  if (node?.majorType === 6) return `${node.tag}(${nodeValue(node.children[0])})`;
  return String(node?.value);
}

function headerEntries(mapNode, source) {
  if (mapNode?.majorType !== 5) {
    const label = source === 'protected' ? 'Protected' : 'Unprotected';
    throw new Error(`${label} header must be a CBOR map.`);
  }
  return mapNode.entries.map(({ key, value }) => {
    const label = key.value;
    const algorithm = label === 1 && typeof value.value === 'number'
      ? ALGORITHM_NAMES.get(value.value)
      : null;
    return {
      label,
      name: HEADER_NAMES.get(label) ?? `Header ${String(label)}`,
      value: nodeValue(value),
      algorithm,
      source,
    };
  });
}

function decodeProtectedHeader(node) {
  const details = byteStringDetails(node);
  if (!details) throw new Error('Protected header must be a CBOR byte string.');
  if (details.byteLength === 0) return [];
  const decoded = decodeCbor(hexToBytes(details.hex));
  if ('error' in decoded) {
    throw new Error(`Protected header is not valid CBOR: ${decoded.error}`);
  }
  return headerEntries(decoded.root, 'protected');
}

function getMessageContainer(root) {
  if (root.majorType === 6) {
    if (!MESSAGE_TYPES.has(root.tag)) {
      throw new Error(`Unrecognized COSE message tag: ${String(root.tag)}.`);
    }
    return { type: MESSAGE_TYPES.get(root.tag), tag: root.tag, array: root.children[0] };
  }
  if (root.majorType === 4 && root.children.length === 4) {
    return {
      type: 'COSE_Sign1 / COSE_Encrypt0 / COSE_Mac0 (untagged)',
      tag: null,
      array: root,
    };
  }
  throw new Error('Unrecognized COSE structure. Expected a tagged four-item COSE array.');
}

/**
 * Parses a Base64, Base64URL, or hexadecimal COSE message without cryptographic verification.
 *
 * @param {string} input COSE CBOR bytes in a supported transport encoding.
 * @param {'auto'|'hex'|'base64'|'base64url'} format Input transport format.
 * @returns {{type: string, tag: number|null, format: string, headers: Array<object>,
 *   payload: {hex: string, base64: string, byteLength: number}|null, body: string}}
 * Parsed display data.
 * @throws {Error} When the transport, CBOR, or COSE structure is invalid.
 */
export function parseCoseMessage(input, format = 'auto') {
  if (typeof input !== 'string') throw new TypeError('COSE input must be a string.');
  const parsed = parseCborInput(input, format);
  if ('error' in parsed) throw new Error(parsed.error);

  const decoded = decodeCbor(parsed.bytes);
  if ('error' in decoded) throw new Error(`Malformed CBOR: ${decoded.error}`);

  const container = getMessageContainer(decoded.root);
  if (container.array?.majorType !== 4 || container.array.children.length !== 4) {
    throw new Error('Unrecognized COSE structure. A COSE message must contain four array items.');
  }

  const [protectedNode, unprotectedNode, payloadNode, bodyNode] = container.array.children;
  const protectedHeaders = decodeProtectedHeader(protectedNode);
  const unprotectedHeaders = headerEntries(unprotectedNode, 'unprotected');
  const headerMap = new Map(protectedHeaders.map((header) => [header.label, header]));
  unprotectedHeaders.forEach((header) => headerMap.set(header.label, header));
  const payload = payloadNode.majorType === 7 && payloadNode.value === null
    ? null
    : byteStringDetails(payloadNode);

  if (!payload && !(payloadNode.majorType === 7 && payloadNode.value === null)) {
    throw new Error('COSE payload must be a CBOR byte string or null for a detached payload.');
  }

  return {
    type: container.type,
    tag: container.tag,
    format: parsed.format,
    headers: Array.from(headerMap.values()),
    payload,
    body: nodeValue(bodyNode),
  };
}

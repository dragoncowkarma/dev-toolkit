import { describe, expect, it } from 'vitest';
import { decodeAuthenticatorFlags, parseWebAuthnInput } from './webauthnInspector.utils.js';

const RP_HASH = '00'.repeat(32);
const AAGUID = '11'.repeat(16);
const COSE_KEY = `a5010203262001215820${'22'.repeat(32)}225820${'33'.repeat(32)}`;
const AUTH_DATA = `${RP_HASH}4100000001${AAGUID}0002aabb${COSE_KEY}`;
const NONE_ATTESTATION =
  `a363666d74646e6f6e656761747453746d74a06861757468446174615886${AUTH_DATA}`;
const PACKED_ATTESTATION =
  `a363666d74667061636b65646761747453746d74a363616c67266373696742aabb` +
  `6378356381430102036861757468446174615886${AUTH_DATA}`;

function toBase64Url(hex) {
  const bytes = Uint8Array.from(hex.match(/../g), (item) => Number.parseInt(item, 16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('WebAuthn parsing', () => {
  it('parses a none-format attestation object', () => {
    const result = parseWebAuthnInput(toBase64Url(NONE_ATTESTATION), 'attestation', 'base64url');
    expect(result.fmt).toBe('none');
    expect(result.authData.signCount).toBe(1);
    expect(result.authData.credential.credentialId).toBe('aabb');
  });

  it('parses packed attestation data and its embedded EC2 COSE key', () => {
    const result = parseWebAuthnInput(toBase64Url(PACKED_ATTESTATION), 'attestation', 'base64url');
    expect(result.fmt).toBe('packed');
    expect(result.attStmt).toEqual({ algorithm: 'ES256', signatureBytes: 2,
      certificateLengths: [3] });
    expect(result.authData.credential.coseKey).toEqual(expect.objectContaining({
      keyType: 'EC2', algorithm: 'ES256',
    }));
  });

  it('decodes every named authenticator-data flag', () => {
    expect(decodeAuthenticatorFlags(0xfd)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'UP', set: true }),
      expect.objectContaining({ name: 'UV', set: true }),
      expect.objectContaining({ name: 'BE', set: true }),
      expect.objectContaining({ name: 'BS', set: true }),
      expect.objectContaining({ name: 'AT', set: true }),
      expect.objectContaining({ name: 'ED', set: true }),
    ]));
  });
});

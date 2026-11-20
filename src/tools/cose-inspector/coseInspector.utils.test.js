import { describe, expect, it } from 'vitest';
import { parseCoseMessage } from './coseInspector.utils.js';

const SIGN1_HEX = 'd28443a10126a104436b69644568656c6c6f40';
const ENCRYPT0_HEX = 'd08443a10101a1054c0102030405060708090a0b0c4663697068657243746167';

describe('parseCoseMessage', () => {
  it('inspects a COSE_Sign1 header and raw payload from hexadecimal CBOR', () => {
    const result = parseCoseMessage(SIGN1_HEX, 'hex');

    expect(result.type).toBe('COSE_Sign1');
    expect(result.tag).toBe(18);
    expect(result.headers).toEqual([
      expect.objectContaining({ label: 1, name: 'Algorithm', algorithm: 'ES256' }),
      expect.objectContaining({ label: 4, name: 'Key ID', source: 'unprotected' }),
    ]);
    expect(result.payload).toEqual({ hex: '68656c6c6f', base64: 'aGVsbG8=', byteLength: 5 });
  });

  it('inspects a Base64 COSE_Encrypt0 message and its IV header', () => {
    const input = btoa(String.fromCharCode(...Uint8Array.from(ENCRYPT0_HEX.match(/../g), (part) => {
      return Number.parseInt(part, 16);
    })));
    const result = parseCoseMessage(input, 'base64');

    expect(result.type).toBe('COSE_Encrypt0');
    expect(result.headers).toContainEqual(expect.objectContaining({ label: 5, name: 'IV' }));
    expect(result.payload).toEqual(expect.objectContaining({ hex: '636970686572' }));
  });

  it('rejects an unrecognized tag or non-COSE array structure', () => {
    expect(() => parseCoseMessage('d81a80', 'hex')).toThrow(/Unrecognized COSE message tag/);
    expect(() => parseCoseMessage('83010203', 'hex')).toThrow(/Unrecognized COSE structure/);
  });

  it('reports malformed CBOR input', () => {
    expect(() => parseCoseMessage('d28443a101', 'hex')).toThrow(/Malformed CBOR/);
  });

  it('rejects missing or invalid protected header byte strings', () => {
    expect(() => parseCoseMessage('d284a0a0f640', 'hex')).toThrow(
      /Protected header must be a CBOR byte string/,
    );
    expect(() => parseCoseMessage('d28441ff a0 f6 40', 'hex')).toThrow(
      /Protected header is not valid CBOR/,
    );
  });
});

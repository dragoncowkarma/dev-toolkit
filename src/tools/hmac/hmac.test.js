import { describe, expect, it } from 'vitest';
import { computeHmac, formatSignature, parseInput, verifyHmac } from './hmac.utils.js';

describe('HMAC utilities', () => {
  it('computes the RFC 4231 SHA-256 vector', async () => {
    await expect(computeHmac('SHA-256', '0b'.repeat(20), 'Hex', 'Hi There', 'UTF-8', 'Hex'))
      .resolves.toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });
  it('computes the RFC 4231 SHA-512 vector', async () => {
    await expect(computeHmac('SHA-512', '0b'.repeat(20), 'Hex', 'Hi There', 'UTF-8', 'Hex'))
      .resolves.toBe('87aa7cdea5ef619d4ff0b4241a1d6cb0' + '2379f4e2ce4ec2787ad0b30545e17cde' +
        'daa833b7d6b8a702038b274eaea3f4e4' + 'be9d914eeb61f1702e696c203a126854');
  });
  it('parses Base64 inputs and produces Base64URL signatures', async () => {
    expect(Array.from(parseInput('a2V5', 'Base64'))).toEqual([107, 101, 121]);
    await expect(computeHmac('SHA-256', 'a2V5', 'Base64', 'aGk=', 'Base64', 'Base64URL'))
      .resolves.toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('formats signatures and verifies matching signatures', async () => {
    expect(formatSignature(Uint8Array.from([251, 255]), 'Base64URL')).toBe('-_8');
    const signature = await computeHmac('SHA-256', 'key', 'UTF-8', 'message', 'UTF-8', 'Hex');
    await expect(verifyHmac('SHA-256', 'key', 'UTF-8', 'message', 'UTF-8', signature, 'Hex'))
      .resolves.toBe(true);
  });
  it('rejects malformed hexadecimal without a runtime failure', () => {
    expect(() => parseInput('xyz', 'Hex')).toThrow('Hex input');
  });
});

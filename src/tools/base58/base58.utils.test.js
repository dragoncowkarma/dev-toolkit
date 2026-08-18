import { describe, expect, it } from 'vitest';
import {
  assertDecodeInputWithinLimit,
  assertEncodeInputWithinLimit,
  decodeBase58CheckDetails,
  decodeBase58Details,
  decodeBase58ToBytes,
  decodeFromBase58,
  doubleSha256,
  encodeBytesToBase58,
  encodeBytesToBase58Check,
  encodeToBase58,
  encodeToBase58Check,
  fileToBase58,
  formatFileSize,
  hexToBytes,
  isValidBase58,
  MAX_BASE58_CHARS,
  MAX_INPUT_BYTES,
} from './base58.utils.js';

describe('base58.utils', () => {
  describe('Base58 Basic Encoding & Decoding', () => {
    it('encodes "Hello World" to "JxF12TrwUP45BMd"', () => {
      expect(encodeToBase58('Hello World')).toBe('JxF12TrwUP45BMd');
    });

    it('decodes "JxF12TrwUP45BMd" to "Hello World"', () => {
      expect(decodeFromBase58('JxF12TrwUP45BMd')).toBe('Hello World');
    });

    it('encodes empty string to empty string', () => {
      expect(encodeToBase58('')).toBe('');
      expect(decodeFromBase58('')).toBe('');
    });
  });

  describe('Leading Zero Byte Preservation', () => {
    it('encodes 0x00 0x00 0x01 with two leading 1s ("112")', () => {
      const bytes = new Uint8Array([0x00, 0x00, 0x01]);
      expect(encodeBytesToBase58(bytes)).toBe('112');
    });

    it('decodes "112" back to 0x00 0x00 0x01', () => {
      const decoded = decodeBase58ToBytes('112');
      expect(Array.from(decoded)).toEqual([0x00, 0x00, 0x01]);
    });

    it('encodes 0x00 0x00 0x00 to "111"', () => {
      const bytes = new Uint8Array([0x00, 0x00, 0x00]);
      expect(encodeBytesToBase58(bytes)).toBe('111');
    });

    it('decodes "111" back to 0x00 0x00 0x00', () => {
      const decoded = decodeBase58ToBytes('111');
      expect(Array.from(decoded)).toEqual([0x00, 0x00, 0x00]);
    });
  });

  describe('Round-trip UTF-8 & Emoji support', () => {
    const unicodeStrings = [
      '',
      'A',
      'Hello World',
      '한국어 테스트 🇰🇷',
      '⚡ Rocket 🚀 & Star ⭐',
    ];

    unicodeStrings.forEach((text) => {
      it(`losslessly roundtrips "${text}"`, () => {
        const encoded = encodeToBase58(text);
        expect(decodeFromBase58(encoded)).toBe(text);
      });
    });
  });

  describe('Hex Encoding & Decoding', () => {
    it('encodes hex bytes to Base58', () => {
      const hex = '48 65 6c 6c 6f 20 57 6f 72 6c 64';
      expect(encodeToBase58(hex, { inputType: 'hex' })).toBe(
        'JxF12TrwUP45BMd'
      );
    });

    it('decodes Base58 to hex string', () => {
      expect(
        decodeFromBase58('JxF12TrwUP45BMd', { outputType: 'hex' })
      ).toBe('48 65 6c 6c 6f 20 57 6f 72 6c 64');
    });

    it('throws error for invalid hex characters', () => {
      expect(() => encodeToBase58('666Z', { inputType: 'hex' })).toThrow(
        'Hex input contains invalid characters.'
      );
    });

    it('throws error for odd hex digit count', () => {
      expect(() => encodeToBase58('666', { inputType: 'hex' })).toThrow(
        'Hex input must have an even number of digits.'
      );
    });
  });

  describe('Base58Check Encoding & Checksum Validation', () => {
    const bitcoinAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    const payloadHex =
      '00 62 e9 07 b1 5c bf 27 d5 42 53 99 eb f6 f0 fb 50 eb b8 8f 18';

    it('decodes valid Bitcoin address with checksumValid: true', async () => {
      const details = await decodeBase58CheckDetails(bitcoinAddress);
      expect(details.checksumValid).toBe(true);
      expect(details.checksumError).toBeUndefined();
      expect(details.hex).toBe(payloadHex);
    });

    it('encodes payload hex to valid Bitcoin address using Base58Check', async () => {
      const result = await encodeToBase58Check(payloadHex, {
        inputType: 'hex',
      });
      expect(result).toBe(bitcoinAddress);
    });

    it('reports checksumValid: false without throwing on corrupted address', async () => {
      const corrupted = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb';
      const details = await decodeBase58CheckDetails(corrupted);
      expect(details.checksumValid).toBe(false);
      expect(details.checksumError).toBe(
        'Base58Check checksum validation failed (checksum mismatch).'
      );
    });

    it('reports checksumValid: false for payloads under 4 bytes or whitespace-only', async () => {
      const short = '1';
      const details = await decodeBase58CheckDetails(short);
      expect(details.checksumValid).toBe(false);
      expect(details.checksumError).toBe(
        'Input is too short for Base58Check (minimum 4-byte checksum required).'
      );

      const whitespace = await decodeBase58CheckDetails('   ');
      expect(whitespace.checksumValid).toBe(false);
      expect(whitespace.checksumError).toBe(
        'Input is too short for Base58Check (minimum 4-byte checksum required).'
      );
    });

    it('computes double SHA-256 correctly', async () => {
      const bytes = new TextEncoder().encode('test');
      const hash = await doubleSha256(bytes);
      expect(hash.length).toBe(32);
    });

    it('encodes bytes to Base58Check with checksum', async () => {
      const bytes = hexToBytes(payloadHex);
      const encoded = await encodeBytesToBase58Check(bytes);
      expect(encoded).toBe(bitcoinAddress);
    });
  });

  describe('Validation & Invalid Characters', () => {
    it('validates well-formed Base58 strings', () => {
      expect(isValidBase58('JxF12TrwUP45BMd')).toBe(true);
      expect(isValidBase58('112')).toBe(true);
      expect(isValidBase58('')).toBe(true);
    });

    it('rejects ambiguous/invalid characters (0, O, I, l)', () => {
      expect(isValidBase58('0')).toBe(false);
      expect(isValidBase58('O')).toBe(false);
      expect(isValidBase58('I')).toBe(false);
      expect(isValidBase58('l')).toBe(false);
    });

    it('throws descriptive error on invalid character during decode', () => {
      expect(() => decodeFromBase58('abc0def')).toThrow(
        "Invalid Base58 character: '0'."
      );
      expect(() => decodeFromBase58('abcOdef')).toThrow(
        "Invalid Base58 character: 'O'."
      );
      expect(() => decodeFromBase58('abcIdef')).toThrow(
        "Invalid Base58 character: 'I'."
      );
      expect(() => decodeFromBase58('abclef')).toThrow(
        "Invalid Base58 character: 'l'."
      );
    });

    it('handles non-string arguments gracefully', () => {
      expect(isValidBase58(123)).toBe(false);
      expect(() => encodeToBase58(123)).toThrow('Input must be a string.');
      expect(() => decodeFromBase58(123)).toThrow('Input must be a string.');
    });
  });

  describe('Binary / Non-UTF-8 Decode Details', () => {
    it('identifies non-UTF-8 bytes and provides details', () => {
      const details = decodeBase58Details('3D');
      expect(details.isUtf8).toBe(false);
      expect(details.text).toBe(null);
      expect(details.hex).toBe('80');
    });
  });

  describe('File & Format Helpers', () => {
    it('converts a File blob to Base58', async () => {
      const blob = new Blob(['Hello World'], { type: 'text/plain' });
      const result = await fileToBase58(blob);
      expect(result).toBe('JxF12TrwUP45BMd');
    });

    it('converts a File blob to Base58Check', async () => {
      const blob = new Blob(['Hello World'], { type: 'text/plain' });
      const result = await fileToBase58(blob, { useChecksum: true });
      expect(result.length).toBeGreaterThan(0);
      const details = await decodeBase58CheckDetails(result);
      expect(details.checksumValid).toBe(true);
      expect(details.text).toBe('Hello World');
    });

    it('rejects files larger than MAX_INPUT_BYTES (2 KB)', async () => {
      const largeContent = new Uint8Array(MAX_INPUT_BYTES + 1024);
      const blob = new Blob([largeContent], { type: 'application/octet-stream' });
      await expect(fileToBase58(blob)).rejects.toThrow(
        `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
      );
    });

    it('accepts a file exactly at MAX_INPUT_BYTES', async () => {
      const content = new Uint8Array(MAX_INPUT_BYTES).fill(1);
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const result = await fileToBase58(blob);
      expect(result.length).toBeGreaterThan(0);
    });

    it('formats file sizes accurately', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1500)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });
  });

  describe('Size Limit Policy', () => {
    it('accepts text input exactly at the MAX_INPUT_BYTES boundary', () => {
      const text = 'a'.repeat(MAX_INPUT_BYTES);
      expect(() => encodeToBase58(text)).not.toThrow();
      expect(assertEncodeInputWithinLimit(text)).toBe(MAX_INPUT_BYTES);
    });

    it('rejects text input exceeding MAX_INPUT_BYTES with a size error', () => {
      const text = 'a'.repeat(MAX_INPUT_BYTES + 1);
      expect(() => encodeToBase58(text)).toThrow(
        `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
      );
      expect(() => encodeToBase58(text)).toThrow(
        'Base58 is intended for short identifiers and keys'
      );
    });

    it('measures oversized text limit by UTF-8 byte length, not character count', () => {
      // Each '한' is 3 bytes in UTF-8, so 1000 chars is well over MAX_INPUT_BYTES
      // in bytes even though the raw character count is smaller.
      const text = '한'.repeat(1000);
      expect(text.length).toBeLessThan(MAX_INPUT_BYTES);
      expect(() => encodeToBase58(text)).toThrow(
        `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
      );
    });

    it('accepts hex input at the MAX_INPUT_BYTES boundary (measured by decoded bytes)', () => {
      const hex = '00'.repeat(MAX_INPUT_BYTES);
      expect(() => encodeToBase58(hex, { inputType: 'hex' })).not.toThrow();
    });

    it('rejects hex input whose decoded byte length exceeds MAX_INPUT_BYTES', () => {
      const hex = '00'.repeat(MAX_INPUT_BYTES + 1);
      expect(() => encodeToBase58(hex, { inputType: 'hex' })).toThrow(
        `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
      );
    });

    it('keeps the invalid-hex error over a size error, even for long malformed hex', () => {
      const invalidHex = 'zz'.repeat(MAX_INPUT_BYTES + 1);
      expect(() => encodeToBase58(invalidHex, { inputType: 'hex' })).toThrow(
        'Hex input contains invalid characters.'
      );

      const oddLengthHex = '0'.repeat((MAX_INPUT_BYTES + 1) * 2 + 1);
      expect(() => encodeToBase58(oddLengthHex, { inputType: 'hex' })).toThrow(
        'Hex input must have an even number of digits.'
      );
    });

    it('rejects oversized encode input for Base58Check too', async () => {
      const text = 'a'.repeat(MAX_INPUT_BYTES + 1);
      await expect(encodeToBase58Check(text)).rejects.toThrow(
        `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
      );
    });

    it('accepts decode input exactly at the MAX_BASE58_CHARS boundary', () => {
      // 'z' has no leading-zero-byte effect, so this exercises the general
      // char-count bound rather than the leading-'1' bound below.
      const base58 = 'z'.repeat(MAX_BASE58_CHARS);
      expect(() => decodeFromBase58(base58, { outputType: 'hex' })).not.toThrow();
      expect(assertDecodeInputWithinLimit(base58)).toBe(MAX_BASE58_CHARS);
    });

    it('decodes the maximal accepted non-leading-1 input to at most MAX_INPUT_BYTES bytes', () => {
      // 'z' is the highest-value Base58 digit, so an all-'z' run of the
      // accepted length is the worst case for decoded byte length; this must
      // be an exact upper bound, not just a length-based approximation.
      const base58 = 'z'.repeat(MAX_BASE58_CHARS);
      const bytes = decodeBase58ToBytes(base58);
      expect(bytes.length).toBeLessThanOrEqual(MAX_INPUT_BYTES);
    });

    it('rejects decode input exceeding MAX_BASE58_CHARS with a size error', () => {
      // +2, not +1: the length prefilter allows one character of slack past
      // MAX_BASE58_CHARS so a legitimate MAX_INPUT_BYTES round-trip (which
      // usually needs one extra digit -- see the boundary test below) is
      // never rejected by length alone. +2 is unambiguously past that slack.
      const base58 = 'z'.repeat(MAX_BASE58_CHARS + 2);
      expect(() => decodeFromBase58(base58)).toThrow(
        `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
      );
      expect(() => decodeBase58Details(base58)).toThrow(
        `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
      );
    });

    it('rejects oversized decode input for Base58Check too', async () => {
      const base58 = 'z'.repeat(MAX_BASE58_CHARS + 2);
      await expect(decodeBase58CheckDetails(base58)).rejects.toThrow(
        `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
      );
    });

    describe('one-character prefilter slack (MAX_BASE58_CHARS + 1)', () => {
      // The length prefilter alone can't distinguish a numeric run at
      // MAX_BASE58_CHARS + 1 that happens to decode within budget (most real
      // MAX_INPUT_BYTES payloads) from one that doesn't (e.g. all-'z', the
      // max-value digit). So it lets the length through, and the exact
      // byte-length check after decoding is the one that must catch the
      // oversized case -- this is exactly the reviewer-requested "actual
      // upper bound on every accepted decoded value".
      it('lets an all-"z" run at MAX_BASE58_CHARS + 1 chars past the length prefilter', () => {
        const base58 = 'z'.repeat(MAX_BASE58_CHARS + 1);
        expect(() => assertDecodeInputWithinLimit(base58)).not.toThrow();
      });

      it('still rejects that all-"z" run via the exact decoded-byte-length check', () => {
        const base58 = 'z'.repeat(MAX_BASE58_CHARS + 1);
        const bytes = decodeBase58ToBytes(base58);
        expect(bytes.length).toBeGreaterThan(MAX_INPUT_BYTES);
        expect(() => decodeFromBase58(base58)).toThrow(
          `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
        );
        expect(() => decodeBase58Details(base58)).toThrow(
          `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
        );
      });

      it('rejects that all-"z" run for Base58Check too, via the byte-length check', async () => {
        const base58 = 'z'.repeat(MAX_BASE58_CHARS + 1);
        await expect(decodeBase58CheckDetails(base58)).rejects.toThrow(
          `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
        );
      });

      it('accepts a MAX_INPUT_BYTES round-trip that needs MAX_BASE58_CHARS + 1 digits', () => {
        // A high-valued (but not maximal) MAX_INPUT_BYTES payload: the most
        // common real-world case that motivates the prefilter's slack.
        const bytes = new Uint8Array(MAX_INPUT_BYTES).fill(0xff);
        bytes[0] = 0x0f; // stay under the true 256^n ceiling so it's decodable
        const encoded = encodeBytesToBase58(bytes);
        expect(encoded.length).toBe(MAX_BASE58_CHARS + 1);
        const decoded = decodeBase58ToBytes(encoded);
        expect(decoded.length).toBe(MAX_INPUT_BYTES);
        expect(() => decodeFromBase58(encoded, { outputType: 'hex' })).not.toThrow();
      });
    });

    describe('regression: numeric-portion bound must be exact, not a ratio estimate', () => {
      // Prior to this fix, the numeric-portion guard used a fixed 1.38
      // chars/byte acceptance ratio (a conservative *allocation* estimate,
      // not a valid *acceptance* bound). That let
      // 'z'.repeat(Math.ceil(MAX_INPUT_BYTES * 1.38)) -- 2,828 chars for a
      // 2,048-byte budget -- through the preflight check, even though it
      // decodes to 2,071 bytes, over MAX_INPUT_BYTES.
      const legacyRatioAcceptedLength = Math.ceil((MAX_INPUT_BYTES * 138) / 100);
      const oversizedZeroLeadingInput = 'z'.repeat(legacyRatioAcceptedLength);

      it('confirms the legacy ratio-accepted length actually decodes over the byte budget', () => {
        // Sanity check that this test still exercises the reported defect.
        expect(legacyRatioAcceptedLength).toBeGreaterThan(MAX_BASE58_CHARS);
        const bytes = decodeBase58ToBytes(oversizedZeroLeadingInput);
        expect(bytes.length).toBeGreaterThan(MAX_INPUT_BYTES);
      });

      it('rejects it via the preflight guard before the BigInt decode path', () => {
        expect(() => assertDecodeInputWithinLimit(oversizedZeroLeadingInput)).toThrow(
          `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
        );
      });

      it('rejects it for plain Base58 decode', () => {
        expect(() => decodeFromBase58(oversizedZeroLeadingInput)).toThrow(
          `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
        );
        expect(() => decodeBase58Details(oversizedZeroLeadingInput)).toThrow(
          `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
        );
      });

      it('rejects it for Base58Check decode', async () => {
        await expect(decodeBase58CheckDetails(oversizedZeroLeadingInput)).rejects.toThrow(
          `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
        );
      });
    });

    it('throws the invalid-character error for malformed decode input under the limit', () => {
      // Below the size limit, so the character error (not the size error) should surface.
      const withInvalidChar = `${'z'.repeat(MAX_BASE58_CHARS - 1)}0`;
      expect(() => decodeFromBase58(withInvalidChar)).toThrow(
        "Invalid Base58 character: '0'."
      );
    });

    describe('leading-1 (zero-byte) decode boundary', () => {
      // Each leading '1' decodes 1:1 to a zero byte, a denser ratio than the
      // ~1.3657 chars/byte the general MAX_BASE58_CHARS estimate assumes.
      // A run of leading '1's must therefore be bounded by MAX_INPUT_BYTES
      // directly, not by MAX_BASE58_CHARS (see assertDecodeInputWithinLimit).
      it('accepts MAX_INPUT_BYTES leading 1s for plain Base58', () => {
        const base58 = '1'.repeat(MAX_INPUT_BYTES);
        expect(assertDecodeInputWithinLimit(base58)).toBe(MAX_INPUT_BYTES);
        const bytes = decodeBase58ToBytes(base58);
        expect(bytes.length).toBe(MAX_INPUT_BYTES);
        expect(() => decodeFromBase58(base58, { outputType: 'hex' })).not.toThrow();
      });

      it('rejects MAX_INPUT_BYTES + 1 leading 1s for plain Base58', () => {
        const base58 = '1'.repeat(MAX_INPUT_BYTES + 1);
        expect(() => decodeFromBase58(base58, { outputType: 'hex' })).toThrow(
          `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
        );
        expect(() => decodeBase58Details(base58)).toThrow(
          `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
        );
      });

      it('accepts MAX_INPUT_BYTES leading 1s for Base58Check', async () => {
        const base58 = '1'.repeat(MAX_INPUT_BYTES);
        const result = await decodeBase58CheckDetails(base58);
        expect(result.rawBytes.length).toBe(MAX_INPUT_BYTES);
      });

      it('rejects MAX_INPUT_BYTES + 1 leading 1s for Base58Check', async () => {
        const base58 = '1'.repeat(MAX_INPUT_BYTES + 1);
        await expect(decodeBase58CheckDetails(base58)).rejects.toThrow(
          `exceeds the ${formatFileSize(MAX_INPUT_BYTES)} Base58 limit`
        );
      });
    });

    it('recovers normally after a rejected oversized input is replaced with valid input', () => {
      const oversized = 'a'.repeat(MAX_INPUT_BYTES + 1);
      expect(() => encodeToBase58(oversized)).toThrow();
      // A subsequent call with valid input must succeed as if nothing happened.
      expect(encodeToBase58('Hello World')).toBe('JxF12TrwUP45BMd');
    });
  });

  describe('Timing Guard (no multi-second stall at the accepted boundary)', () => {
    it('encodes a MAX_INPUT_BYTES payload well under a multi-second stall', () => {
      const bytes = new Uint8Array(MAX_INPUT_BYTES);
      crypto.getRandomValues(bytes);
      const start = performance.now();
      encodeBytesToBase58(bytes);
      const elapsedMs = performance.now() - start;
      // Measured ~27ms warmed on Node v22.18.0 (x86_64 Darwin) for 2048 bytes;
      // 1000ms leaves generous headroom for slower/loaded CI hardware while
      // still catching any regression back toward multi-second behavior.
      expect(elapsedMs).toBeLessThan(1000);
    });

    it('decodes a realistic MAX_INPUT_BYTES-derived Base58 string well under a stall', () => {
      const bytes = new Uint8Array(MAX_INPUT_BYTES);
      crypto.getRandomValues(bytes);
      const encoded = encodeBytesToBase58(bytes);
      // MAX_BASE58_CHARS is the guaranteed-safe length (every digit
      // combination of that length is <= MAX_INPUT_BYTES bytes); a real
      // random MAX_INPUT_BYTES payload typically needs one more digit than
      // that to reach its full value, so the bound here is +1, matching the
      // decode-side prefilter's slack (see assertDecodeInputWithinLimit).
      expect(encoded.length).toBeLessThanOrEqual(MAX_BASE58_CHARS + 1);
      const start = performance.now();
      decodeBase58ToBytes(encoded);
      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(1000);
    });
  });
});

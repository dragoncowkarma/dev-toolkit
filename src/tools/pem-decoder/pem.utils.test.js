import { describe, expect, it } from 'vitest';
import { parseDer } from '../asn1-decoder/asn1.utils.js';
import { parsePemBlocks } from './pem.utils.js';

const CERTIFICATE = '-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----';

describe('parsePemBlocks', () => {
  it('extracts the label and bytes from one PEM block', () => {
    const [block] = parsePemBlocks(CERTIFICATE);
    expect(block.label).toBe('CERTIFICATE');
    expect(Array.from(block.bytes)).toEqual([0x30, 0x03, 0x02, 0x01, 0x01]);
  });

  it('extracts multiple concatenated PEM blocks', () => {
    const blocks = parsePemBlocks(
      `${CERTIFICATE}\n${CERTIFICATE.replaceAll('CERTIFICATE', 'PRIVATE KEY')}`
    );
    expect(blocks.map((block) => block.label)).toEqual(['CERTIFICATE', 'PRIVATE KEY']);
  });

  it('rejects malformed Base64 payloads', () => {
    expect(() => parsePemBlocks(CERTIFICATE.replace('MAMCAQE=', 'not-base64!'))).toThrow(
      /invalid Base64/i
    );
  });

  it('rejects mismatched BEGIN and END labels', () => {
    expect(() => parsePemBlocks(CERTIFICATE.replace('END CERTIFICATE', 'END PRIVATE KEY'))).toThrow(
      /does not match/i
    );
  });

  it('provides bytes that the ASN.1 DER decoder can parse', () => {
    const [block] = parsePemBlocks(CERTIFICATE);
    expect(parseDer(block.bytes)[0].tagName).toBe('SEQUENCE');
  });
});

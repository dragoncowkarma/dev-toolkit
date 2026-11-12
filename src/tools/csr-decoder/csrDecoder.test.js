import { describe, expect, it } from 'vitest';
import { parseCsr, SAMPLE_ECDSA_CSR, SAMPLE_RSA_CSR } from './csrDecoder.utils.js';

describe('parseCsr', () => {
  it('parses an RSA v1 request and its requested extensions', () => {
    const result = parseCsr(SAMPLE_RSA_CSR);
    expect(result.version).toBe('v1 (0)');
    expect(result.publicKey.details).toContain('2048 bit RSA');
    expect(result.signatureAlgorithm).toBe('sha256WithRSAEncryption');
    expect(result.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Subject Alternative Name',
        value: expect.stringContaining('DNS:example.test'),
      }),
      expect.objectContaining({ name: 'Basic Constraints', value: 'CA:FALSE' }),
      expect.objectContaining({
        name: 'Key Usage',
        value: expect.stringContaining('keyEncipherment'),
      }),
    ]));
  });
  it('accepts NEW CERTIFICATE REQUEST PEM and parses an ECDSA named curve', () => {
    const result = parseCsr(SAMPLE_ECDSA_CSR);
    expect(result.publicKey).toEqual({
      algorithm: 'EC Public Key',
      details: 'P-256 (prime256v1)',
    });
    expect(result.signatureAlgorithm).toBe('ecdsa-with-SHA256');
  });
  it('reports malformed and truncated DER safely', () => {
    expect(() => parseCsr('not a CSR')).toThrow(/Invalid CSR/);
    expect(() => parseCsr(SAMPLE_RSA_CSR.replace(/.{30}(?=-----END)/s, ''))).toThrow(/Invalid CSR/);
  });
  it('rejects an unsupported ASN.1 high tag without escaping the parser', () => {
    const malformed = SAMPLE_RSA_CSR.replace('MIID', 'HxID');
    expect(() => parseCsr(malformed)).toThrow(/Invalid CSR/);
  });
  it('makes non-v1 version explicit rather than treating it as v1', () => {
    const changedVersion = SAMPLE_RSA_CSR.replace('MIIDFDCCAfwCAQA', 'MIIDFDCCAfwCAQI');
    expect(parseCsr(changedVersion).version).toBe('Unsupported (2)');
  });
});

import { describe, expect, it } from 'vitest';
import { validateAbaRoutingNumber } from './aba.utils.js';

describe('validateAbaRoutingNumber', () => {
  it('accepts a valid ABA routing number', () => {
    expect(validateAbaRoutingNumber('021000021')).toEqual({ valid: true, error: '' });
  });

  it('rejects a routing number with an invalid checksum', () => {
    expect(validateAbaRoutingNumber('021000022')).toEqual({
      valid: false,
      error: 'Routing number checksum is invalid.',
    });
  });

  it('rejects a routing number with the wrong length', () => {
    expect(validateAbaRoutingNumber('02100002')).toEqual({
      valid: false,
      error: 'Routing number must contain exactly 9 digits.',
    });
  });

  it('rejects non-numeric input', () => {
    expect(validateAbaRoutingNumber('02100002A')).toEqual({
      valid: false,
      error: 'Routing number can only contain digits.',
    });
    expect(validateAbaRoutingNumber(21000021)).toEqual({
      valid: false,
      error: 'Routing number can only contain digits.',
    });
  });

  it('rejects an invalid Federal Reserve prefix', () => {
    expect(validateAbaRoutingNumber('130000000')).toEqual({
      valid: false,
      error: 'Routing number has an invalid Federal Reserve prefix.',
    });
  });

  it('allows each Federal Reserve prefix range', () => {
    expect(validateAbaRoutingNumber('001000009').valid).toBe(true);
    expect(validateAbaRoutingNumber('211000006').valid).toBe(true);
    expect(validateAbaRoutingNumber('611000004').valid).toBe(true);
    expect(validateAbaRoutingNumber('801000005').valid).toBe(true);
  });
});

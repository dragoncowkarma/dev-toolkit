import { describe, expect, it } from 'vitest';
import {
  expandEui48ToEui64,
  inspectMacAddress,
  normalizeMacAddress,
  parseMacAddress,
} from './macAddress.utils.js';

describe('MAC address normalization', () => {
  it.each([
    '00:1A:2B:3C:4D:5E',
    '00-1a-2b-3c-4d-5e',
    '001a.2b3c.4d5e',
    '001A2B3C4D5E',
    '00 1a 2b 3c 4d 5e',
  ])('normalizes supported EUI-48 input: %s', (input) => {
    expect(normalizeMacAddress(input)).toEqual({
      formats: {
        colon: '00:1A:2B:3C:4D:5E',
        hyphen: '00-1A-2B-3C-4D-5E',
        ciscoDot: '001a.2b3c.4d5e',
        bareHex: '001A2B3C4D5E',
      },
      error: '',
    });
  });

  it('returns descriptive validation messages instead of throwing', () => {
    expect(parseMacAddress('00:1A:2B:3C:4D')).toHaveProperty(
      'error',
      expect.stringContaining('must contain exactly'),
    );
    expect(parseMacAddress('00:1A:2B:3C:4D:GG')).toHaveProperty(
      'error',
      expect.stringContaining('may contain only'),
    );
    expect(parseMacAddress('00:1A:2B:3C:4D:5E:6F')).toHaveProperty(
      'error',
      expect.stringContaining('must contain exactly'),
    );
  });
});

describe('EUI-64 expansion and bitwise inspection', () => {
  it('inserts FF:FE and toggles the U/L bit when expanding EUI-48', () => {
    expect(expandEui48ToEui64('00:1A:2B:3C:4D:5E')).toEqual({
      eui64: '02:1A:2B:FF:FE:3C:4D:5E',
      error: '',
    });
  });

  it('identifies address bits and extracts the OUI', () => {
    expect(inspectMacAddress('03:1A:2B:3C:4D:5E')).toEqual({
      inspection: {
        addressType: 'Multicast',
        administration: 'Locally Administered',
        oui: '03:1A:2B',
      },
      error: '',
    });
  });
});

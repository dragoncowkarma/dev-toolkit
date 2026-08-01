import { describe, expect, it } from 'vitest';
import {
  calculateSubnet,
  getAddressClass,
  isPrivateIPv4,
  parseCidr,
  parseIPv4,
  prefixFromMask,
} from './subnet.utils.js';

describe('IPv4 and CIDR parsing', () => {
  it('parses valid IPv4 and CIDR input', () => {
    expect(parseIPv4('192.168.001.010')).toEqual({ address: '192.168.1.10', integer: 3232235786 });
    expect(parseCidr('192.168.1.10/24')).toMatchObject({ address: '192.168.1.10', prefix: 24 });
    expect(prefixFromMask('255.255.255.0')).toBe(24);
  });

  it('rejects invalid address, prefix, and non-contiguous mask input', () => {
    expect(parseIPv4('192.168.1.256')).toBeNull();
    expect(parseCidr('192.168.1.10/33')).toBeNull();
    expect(prefixFromMask('255.0.255.0')).toBeNull();
  });
});

describe('subnet calculations', () => {
  it('calculates network, broadcast, hosts, and masks for a /24', () => {
    expect(calculateSubnet('192.168.1.10', 24)).toMatchObject({
      networkAddress: '192.168.1.0',
      broadcastAddress: '192.168.1.255',
      firstUsableHost: '192.168.1.1',
      lastUsableHost: '192.168.1.254',
      totalAddresses: 256,
      usableHostCount: 254,
      subnetMask: '255.255.255.0',
      wildcardMask: '0.0.0.255',
    });
  });

  it('handles point-to-point and single-host ranges', () => {
    expect(calculateSubnet('10.0.0.0', 31)).toMatchObject({
      firstUsableHost: '10.0.0.0',
      lastUsableHost: '10.0.0.1',
      usableHostCount: 2,
    });
    expect(calculateSubnet('10.0.0.12', 32)).toMatchObject({
      networkAddress: '10.0.0.12',
      broadcastAddress: '10.0.0.12',
      usableHostCount: 1,
    });
  });
});

describe('address classification', () => {
  it('identifies traditional classes and RFC 1918 private ranges', () => {
    expect(getAddressClass(parseIPv4('10.0.0.1').integer)).toBe('A');
    expect(getAddressClass(parseIPv4('172.16.0.1').integer)).toBe('B');
    expect(getAddressClass(parseIPv4('192.168.0.1').integer)).toBe('C');
    expect(isPrivateIPv4(parseIPv4('10.1.2.3').integer)).toBe(true);
    expect(isPrivateIPv4(parseIPv4('172.32.0.1').integer)).toBe(false);
  });
});

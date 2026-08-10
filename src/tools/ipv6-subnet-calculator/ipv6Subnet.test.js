import { describe, expect, it } from 'vitest';
import {
  calculateIPv6Subnet,
  compressIPv6,
  expandIPv6,
  parseIPv6Cidr,
} from './ipv6Subnet.utils.js';

describe('IPv6 parsing and normalization', () => {
  it('parses compressed CIDR notation with mixed-case hexadecimal digits', () => {
    expect(parseIPv6Cidr('2001:DB8:aBcD::1/64')).toMatchObject({
      address: '2001:db8:abcd::1',
      expandedAddress: '2001:0db8:abcd:0000:0000:0000:0000:0001',
      prefix: 64,
    });
  });

  it('round-trips zero compression and preserves the first longest run', () => {
    const expanded = '2001:0db8:0000:0000:0001:0000:0000:0001';
    expect(compressIPv6(expanded)).toBe('2001:db8::1:0:0:1');
    expect(expandIPv6(compressIPv6(expanded))).toBe(expanded);
    expect(compressIPv6('0:0:0:0:0:0:0:0')).toBe('::');
  });

  it('rejects bad groups, out-of-range prefixes, and malformed compression', () => {
    expect(parseIPv6Cidr('2001:db8:zzzz::/32')).toBeNull();
    expect(parseIPv6Cidr('2001:db8::/129')).toBeNull();
    expect(parseIPv6Cidr('2001::db8::1/64')).toBeNull();
    expect(parseIPv6Cidr('2001:db8:0:0:0:0:0/64')).toBeNull();
  });
});

describe('IPv6 subnet calculation', () => {
  it('calculates the documentation range with exact BigInt capacity', () => {
    expect(calculateIPv6Subnet('2001:db8::/32')).toEqual({
      expandedAddress: '2001:0db8:0000:0000:0000:0000:0000:0000',
      compressedAddress: '2001:db8::',
      networkAddress: '2001:db8::',
      prefix: 32,
      totalAddresses: 2n ** 96n,
      firstAddress: '2001:db8::',
      lastAddress: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
    });
  });

  it('handles prefix boundary values zero and 128', () => {
    expect(calculateIPv6Subnet('2001:db8::1/0')).toMatchObject({
      networkAddress: '::',
      totalAddresses: 2n ** 128n,
      firstAddress: '::',
      lastAddress: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    });
    expect(calculateIPv6Subnet('2001:db8::1/128')).toMatchObject({
      networkAddress: '2001:db8::1',
      totalAddresses: 1n,
      firstAddress: '2001:db8::1',
      lastAddress: '2001:db8::1',
    });
  });
});

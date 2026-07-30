import { describe, expect, it } from 'vitest';
import {
  formatChmodCommand,
  formatOctal,
  formatSymbolic,
  matrixToMode,
  modeToMatrix,
  parseOctal,
  parseSymbolic,
} from './chmodUtils.js';

describe('chmod octal conversion', () => {
  it('parses standard and special-bit octal values', () => {
    expect(parseOctal('755')).toBe(0o755);
    expect(parseOctal('0755')).toBe(0o755);
    expect(parseOctal('4755')).toBe(0o4755);
    expect(parseOctal('888')).toBeNull();
  });

  it('formats octal values and chmod commands', () => {
    expect(formatOctal(0o644)).toBe('644');
    expect(formatOctal(0o4755)).toBe('4755');
    expect(formatChmodCommand(0o755, 'script.sh')).toBe('chmod 755 script.sh');
  });
});

describe('chmod symbolic conversion', () => {
  it('parses file-type-prefixed symbolic permissions', () => {
    expect(parseSymbolic('-rwxr-xr-x')).toBe(0o755);
    expect(parseSymbolic('rw-r--r--')).toBe(0o644);
    expect(parseSymbolic('-rwsr-sr-t')).toBe(0o7755);
    expect(parseSymbolic('-rwxr-xr-z')).toBeNull();
  });

  it('renders setuid, setgid, and sticky bits with and without execute', () => {
    expect(formatSymbolic(0o7755)).toBe('-rwsr-sr-t');
    expect(formatSymbolic(0o7644)).toBe('-rwSr-Sr-T');
  });
});

describe('chmod permission matrix conversion', () => {
  it('round-trips normal and special checkbox values', () => {
    const matrix = modeToMatrix(0o6754);
    expect(matrix.permissions.owner).toEqual({ read: true, write: true, execute: true });
    expect(matrix.permissions.group).toEqual({ read: true, write: false, execute: true });
    expect(matrix.permissions.others).toEqual({ read: true, write: false, execute: false });
    expect(matrix.special).toEqual({ setuid: true, setgid: true, sticky: false });
    expect(matrixToMode(matrix)).toBe(0o6754);
  });
});

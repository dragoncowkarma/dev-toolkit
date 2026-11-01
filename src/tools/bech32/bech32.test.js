import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Bech32Tool from './Bech32Tool.jsx';
import {
  BECH32,
  BECH32M,
  bytesToHex,
  bytesToUtf8,
  convertBits,
  decodeBech32,
  encodeBech32,
  hexToBytes,
  utf8ToBytes,
  verifyChecksum,
} from './bech32.utils.js';

function resultValue(label) {
  const heading = screen.getByRole('heading', { name: label });
  return within(heading.parentElement).getByText(/.+/, {
    selector: '.bech32-tool__result-value',
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Bech32 utilities', () => {
  it('encodes the official empty-payload BIP-173 and BIP-350 vectors', () => {
    expect(encodeBech32('a', [], BECH32)).toBe('a12uel5l');
    expect(encodeBech32('a', [], BECH32M)).toBe('a1lqfn3a');
  });

  it('decodes official Bech32 and Bech32m vectors with their distinct constants', () => {
    const bech32Vectors = [
      'A12UEL5L',
      'a12uel5l',
      'an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs',
      'abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw',
      '11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j',
      'split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w',
      '?1ezyfcl',
    ];
    const bech32mVectors = [
      'A1LQFN3A',
      'a1lqfn3a',
      'an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6',
      'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
      '11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8',
      'split1checkupstagehandshakeupstreamerranterredcaperredlc445v',
      '?1v759aa',
    ];

    for (const value of bech32Vectors) {
      expect(decodeBech32(value).variant).toBe(BECH32);
    }
    for (const value of bech32mVectors) {
      expect(decodeBech32(value).variant).toBe(BECH32M);
    }
  });

  it('rejects BIP-invalid case, separator, alphabet, HRP, and checksum inputs', () => {
    const invalidVectors = [
      'a12UEL5L',
      'pzry9x0s0muk',
      '1pzry9x0s0muk',
      'x1b4n0q5v',
      'li1dgmt3',
      'A1G7SGD8',
      'qyrz8wqd2c9m',
      'y1b0jsk6g',
      'lt1igcx5c0',
      'in1muywd',
      'M1VUXWEZ',
    ];
    for (const value of invalidVectors) {
      expect(() => decodeBech32(value)).toThrow();
    }
    expect(() => decodeBech32('a12UEL5L')).toThrow(/Mixed-case/);
    expect(() => decodeBech32('x1b4n0q5v')).toThrow(/alphabet/i);
    expect(() => decodeBech32(' 1lqfn3a')).toThrow(/printable/i);
    expect(() => decodeBech32('a1lqfn3q')).toThrow(/Checksum mismatch/);
  });

  it('converts UTF-8 bytes to and from 5-bit words and rejects trailing padding', () => {
    const bytes = new TextEncoder().encode('hello');
    const words = convertBits(bytes, 8, 5, true);
    expect(Array.from(convertBits(words, 5, 8, false))).toEqual(Array.from(bytes));
    expect(() => convertBits([1], 5, 8, false)).toThrow(/trailing padding/i);
  });

  it('parses hexadecimal bytes and exposes the checksum result independently', () => {
    expect(bytesToHex(hexToBytes('48 65 6c 6c 6f'))).toBe('48656c6c6f');
    expect(() => hexToBytes('0')).toThrow(/complete pairs/i);
    const decoded = decodeBech32('a1lqfn3a');
    expect(verifyChecksum(decoded.hrp, [...decoded.words, ...'lqfn3a'].map(
      (character) => 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'.indexOf(character)
    ))).toBe(BECH32M);
  });

  it('encodes and decodes UTF-8 without accepting malformed UTF-8 previews', () => {
    expect(bytesToHex(utf8ToBytes('안녕 🚀'))).toBe('ec9588eb859520f09f9a80');
    expect(bytesToUtf8(utf8ToBytes('안녕 🚀'))).toBe('안녕 🚀');
    expect(bytesToUtf8([0xc3, 0x28])).toBeNull();
  });
});

describe('Bech32Tool', () => {
  it('encodes UTF-8 text and changes the selected checksum variant', async () => {
    render(createElement(Bech32Tool));
    fireEvent.change(screen.getByLabelText('Human-readable part (HRP)'), {
      target: { value: 'test' },
    });
    fireEvent.change(screen.getByLabelText('UTF-8 payload'), { target: { value: 'hello' } });

    const words = convertBits(new TextEncoder().encode('hello'), 8, 5, true);
    await waitFor(() => expect(resultValue('Bech32 string')).toHaveTextContent(
      encodeBech32('test', words, BECH32)
    ));

    fireEvent.change(screen.getByLabelText('Target variant'), { target: { value: BECH32M } });
    await waitFor(() => expect(resultValue('Bech32 string')).toHaveTextContent(
      encodeBech32('test', words, BECH32M)
    ));
  });

  it('loads an official BIP-350 preset and reports decoded metadata', async () => {
    render(createElement(Bech32Tool));
    fireEvent.click(screen.getByRole('button', { name: 'BIP-350: a1lqfn3a' }));

    await waitFor(() => expect(resultValue('Detected variant')).toHaveTextContent(BECH32M));
    expect(resultValue('Human-readable part')).toHaveTextContent('a');
    expect(resultValue('Decoded hex bytes')).toHaveTextContent('Empty');
  });

  it('reports invalid Decode input through an accessible alert', async () => {
    render(createElement(Bech32Tool));
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Bech32 or Bech32m string'), {
      target: { value: 'a12UEL5L' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Mixed-case Bech32 strings');
  });

  it('copies a result with feedback', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(createElement(Bech32Tool));
    fireEvent.change(screen.getByLabelText('UTF-8 payload'), { target: { value: 'hello' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy Bech32 string' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Bech32 string' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Copied to clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
  });
});

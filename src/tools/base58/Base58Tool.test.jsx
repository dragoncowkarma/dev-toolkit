import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base58Tool from './Base58Tool.jsx';
import * as base58Utils from './base58.utils.js';

const { MAX_BASE58_CHARS, MAX_INPUT_BYTES } = base58Utils;

vi.mock('./base58.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fileToBase58: vi.fn(actual.fileToBase58) };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Base58Tool UI & Interactions', () => {
  it('encodes text to Base58 and Base58Check', async () => {
    render(<Base58Tool />);
    const textarea = screen.getByLabelText('Text');
    fireEvent.change(textarea, { target: { value: 'Hello World' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Base58Check' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Base58Check').value).not.toBe('JxF12TrwUP45BMd');
      expect(screen.getByLabelText('Base58Check').value.length).toBeGreaterThan(0);
    });
  });

  it('decodes Base58 to text', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    const textarea = screen.getByLabelText('Base58');
    fireEvent.change(textarea, { target: { value: 'JxF12TrwUP45BMd' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('Hello World');
    });
  });

  it('decodes valid Bitcoin address Base58Check with checksumValid: true notice', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base58Check' }));

    const bitcoinAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    const textarea = screen.getByLabelText('Base58Check');
    fireEvent.change(textarea, { target: { value: bitcoinAddress } });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '✓ Checksum valid. Decoded data is binary (non-UTF-8). Displaying Hex view.'
      );
    });

    expect(screen.getByLabelText('Text')).toHaveValue(
      '00 62 e9 07 b1 5c bf 27 d5 42 53 99 eb f6 f0 fb 50 eb b8 8f 18'
    );
  });

  it('shows non-throwing warning notice when Base58Check checksum fails', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base58Check' }));

    const corruptedAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb';
    const textarea = screen.getByLabelText('Base58Check');
    fireEvent.change(textarea, { target: { value: corruptedAddress } });

    await waitFor(() => {
      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveTextContent(
        '⚠ Checksum mismatch: Base58Check checksum validation failed (checksum mismatch).'
      );
      expect(statusEl).toHaveClass('base58-warning');
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles Hex input format in Encode mode', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));

    const textarea = screen.getByLabelText('Hex Bytes');
    fireEvent.change(textarea, {
      target: { value: '48 65 6c 6c 6f 20 57 6f 72 6c 64' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });
  });

  it('handles Hex output format in Decode mode', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));

    const textarea = screen.getByLabelText('Base58');
    fireEvent.change(textarea, { target: { value: 'JxF12TrwUP45BMd' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Hex Bytes')).toHaveValue(
        '48 65 6c 6c 6f 20 57 6f 72 6c 64'
      );
    });
  });

  it('shows non-crashing alert for invalid Base58 input characters', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    fireEvent.change(screen.getByLabelText('Base58'), {
      target: { value: '0000' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Invalid Base58 character: '0'."
    );
  });

  it('swaps input and output content in plain mode', async () => {
    render(<Base58Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Hello World' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));
    expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('Hello World');
    });
  });

  it(
    'swaps Base58Check decoded valid text back to Base58Check encode ' +
      'in Text input mode',
    async () => {
      render(<Base58Tool />);
      fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
      fireEvent.click(screen.getByRole('button', { name: 'Base58Check' }));

      const base58CheckText = '32UWxgjUJDXeRwy6c6Fxf';
      const inputArea = screen.getByLabelText('Base58Check');
      fireEvent.change(inputArea, { target: { value: base58CheckText } });

      await waitFor(() => {
        expect(screen.getByLabelText('Text')).toHaveValue('Hello World');
        expect(screen.getByRole('status')).toHaveTextContent('✓ Checksum valid.');
      });

      fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));

      expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByLabelText('Text')).toHaveValue('Hello World');

      await waitFor(() => {
        expect(screen.getByLabelText('Base58Check')).toHaveValue(base58CheckText);
      });
    });

  it('clears all input, output, notices, and errors', async () => {
    render(<Base58Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Hello World' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).not.toHaveValue('');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base58')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Base58Tool Clipboard', () => {
  it('announces copy status to screen readers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Base58Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Hello World' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('handles copy failure', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<Base58Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Hello World' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to copy to clipboard.'
    );
  });
});

describe('Base58Tool File Upload', () => {
  it('converts file to Base58', async () => {
    render(<Base58Tool />);
    const file = new File(['Hello World'], 'hello.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base58');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('📁 hello.txt (11 B)');
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });
  });

  it('rejects file upload exceeding max size (2 KB) with role alert', async () => {
    render(<Base58Tool />);
    const largeContent = new Uint8Array(MAX_INPUT_BYTES + 1024);
    const file = new File([largeContent], 'large.bin', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Convert a file to Base58');
    await act(async () => selectFile(fileInput, file));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'exceeds the 2.0 KB Base58 limit'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Base58 is intended for short identifiers and keys'
    );
  });

  it('ignores file read resolving after Clear', async () => {
    const deferred = createDeferred();
    base58Utils.fileToBase58.mockReturnValueOnce(deferred.promise);

    render(<Base58Tool />);
    const file = new File(['hello'], 'old.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base58');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve('JxF12TrwUP45BMd');
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base58')).toHaveValue('');
  });
});

describe('Base58Tool Textarea Size Limit', () => {
  it('rejects pasted text over MAX_INPUT_BYTES without freezing, with role alert', async () => {
    render(<Base58Tool />);
    const oversizedText = 'a'.repeat(MAX_INPUT_BYTES + 1);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: oversizedText },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'exceeds the 2.0 KB Base58 limit'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Base58 is intended for short identifiers and keys'
    );
    expect(screen.getByLabelText('Base58')).toHaveValue('');
  });

  it('encodes text exactly at the MAX_INPUT_BYTES boundary without an error', async () => {
    render(<Base58Tool />);
    const boundaryText = 'a'.repeat(MAX_INPUT_BYTES);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: boundaryText },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Base58').value.length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects oversized hex input based on decoded bytes, not character count', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));

    const oversizedHex = '00'.repeat(MAX_INPUT_BYTES + 1);
    fireEvent.change(screen.getByLabelText('Hex Bytes'), {
      target: { value: oversizedHex },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'exceeds the 2.0 KB Base58 limit'
    );
  });

  it('keeps the existing invalid-hex error instead of a size error for malformed hex', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));

    fireEvent.change(screen.getByLabelText('Hex Bytes'), {
      target: { value: '66Z' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hex input contains invalid characters.'
    );
  });

  it('rejects oversized Base58 decode input with role alert', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    // 'z' has no leading-zero-byte effect, exercising the general char-count
    // bound rather than the leading-'1' bound covered separately below.
    // MAX_BASE58_CHARS + 2 (not +1): the length prefilter allows one
    // character of slack past MAX_BASE58_CHARS so it never rejects a
    // legitimate MAX_INPUT_BYTES round-trip (see assertDecodeInputWithinLimit),
    // so +1 alone would be caught by the byte-length check instead, with a
    // different message -- covered by the dedicated test below.
    const oversizedBase58 = 'z'.repeat(MAX_BASE58_CHARS + 2);
    fireEvent.change(screen.getByLabelText('Base58'), {
      target: { value: oversizedBase58 },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
    );
  });

  it('rejects oversized Base58Check decode input with role alert', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base58Check' }));

    const oversizedBase58 = 'z'.repeat(MAX_BASE58_CHARS + 2);
    fireEvent.change(screen.getByLabelText('Base58Check'), {
      target: { value: oversizedBase58 },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `exceeds the ${MAX_BASE58_CHARS}-character Base58 limit`
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects Base58 input one char past MAX_BASE58_CHARS via the byte-length check', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    // At exactly MAX_BASE58_CHARS + 1, the length prefilter's one-character
    // slack lets this through, but an all-'z' (max-value-digit) run at this
    // length decodes to more than MAX_INPUT_BYTES bytes, so it must still be
    // rejected -- by the post-decode exact byte-length check this time.
    const oversizedBase58 = 'z'.repeat(MAX_BASE58_CHARS + 1);
    fireEvent.change(screen.getByLabelText('Base58'), {
      target: { value: oversizedBase58 },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'which exceeds the'
    );
  });

  it('rejects a Base58 decode input with more than MAX_INPUT_BYTES leading 1s', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    // Each leading '1' decodes to one zero byte, so MAX_INPUT_BYTES + 1 of
    // them alone exceeds the byte budget well under MAX_BASE58_CHARS chars.
    const oversizedLeadingZeros = '1'.repeat(MAX_INPUT_BYTES + 1);
    fireEvent.change(screen.getByLabelText('Base58'), {
      target: { value: oversizedLeadingZeros },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `exceeds the 2.0 KB Base58 limit`
    );
  });

  it('rejects a Base58Check decode input with more than MAX_INPUT_BYTES leading 1s', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base58Check' }));

    const oversizedLeadingZeros = '1'.repeat(MAX_INPUT_BYTES + 1);
    fireEvent.change(screen.getByLabelText('Base58Check'), {
      target: { value: oversizedLeadingZeros },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `exceeds the 2.0 KB Base58 limit`
    );
  });

  it('accepts a Base58 decode input with exactly MAX_INPUT_BYTES leading 1s', async () => {
    render(<Base58Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    const boundaryLeadingZeros = '1'.repeat(MAX_INPUT_BYTES);
    fireEvent.change(screen.getByLabelText('Base58'), {
      target: { value: boundaryLeadingZeros },
    });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('recovers and encodes after oversized input is replaced with valid text', async () => {
    render(<Base58Tool />);
    const oversizedText = 'a'.repeat(MAX_INPUT_BYTES + 1);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: oversizedText },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Hello World' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Base58')).toHaveValue('JxF12TrwUP45BMd');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

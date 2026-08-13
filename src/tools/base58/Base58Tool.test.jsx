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
      expect(screen.getByRole('status')).toHaveTextContent(
        '⚠ Checksum mismatch: Base58Check checksum validation failed (checksum mismatch).'
      );
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

  it('swaps input and output content', async () => {
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

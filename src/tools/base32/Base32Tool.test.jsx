import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base32Tool from './Base32Tool.jsx';
import * as base32Utils from './base32.utils.js';

vi.mock('./base32.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fileToBase32: vi.fn(actual.fileToBase32) };
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

describe('Base32Tool UI & Interactions', () => {
  it('encodes text to padded and unpadded Base32', async () => {
    render(<Base32Tool />);
    const textarea = screen.getByLabelText('Text');
    fireEvent.change(textarea, { target: { value: 'foo' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unpadded' }));
    expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6');

    fireEvent.click(screen.getByRole('button', { name: 'Padded (=)' }));
    expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
  });

  it('decodes padded and unpadded Base32 to text', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    const textarea = screen.getByLabelText('Base32');
    fireEvent.change(textarea, { target: { value: 'MZXW6YTBOI======' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('foobar');
    });

    fireEvent.change(textarea, { target: { value: 'MZXW6YTBOI' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('foobar');
    });
  });

  it('handles Hex input format in Encode mode', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));

    const textarea = screen.getByLabelText('Hex Bytes');
    fireEvent.change(textarea, { target: { value: '66 6f 6f 62 61 72' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6YTBOI======');
    });
  });

  it('handles Hex output format in Decode mode', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));

    const textarea = screen.getByLabelText('Base32');
    fireEvent.change(textarea, { target: { value: 'MZXW6YTBOI======' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Hex Bytes')).toHaveValue('66 6f 6f 62 61 72');
    });
  });

  it('shows non-crashing alert for invalid Base32 input', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    fireEvent.change(screen.getByLabelText('Base32'), {
      target: { value: 'INVALID!' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Base32 input contains invalid characters.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders role="status" notice and Hex fallback for non-UTF-8 Base32 decode', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    const textarea = screen.getByLabelText('Base32');
    fireEvent.change(textarea, { target: { value: '74======' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('ff');
    });

    const statusNotice = screen.getByRole('status');
    expect(statusNotice).toHaveAttribute('aria-live', 'polite');
    expect(statusNotice).toHaveTextContent(
      'Decoded data is binary (non-UTF-8). Displaying Hex view.'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps Swap enabled for binary decode notice and swaps Hex back to Base32', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    const textarea = screen.getByLabelText('Base32');
    fireEvent.change(textarea, { target: { value: '74======' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('ff');
    });

    const swapBtn = screen.getByRole('button', { name: '⇅ Swap' });
    expect(swapBtn).not.toBeDisabled();

    fireEvent.click(swapBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('74======');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears informational notice when input changes, mode switches, or cleared', async () => {
    render(<Base32Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    const textarea = screen.getByLabelText('Base32');
    fireEvent.change(textarea, { target: { value: '74======' } });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Decoded data is binary (non-UTF-8). Displaying Hex view.'
      );
    });

    // 1. Changing input to valid UTF-8 Base32
    fireEvent.change(textarea, { target: { value: 'MZXW6===' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('foo');
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // 2. Switching mode after binary notice
    fireEvent.change(textarea, { target: { value: '74======' } });
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Encode' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // 3. Clearing tool
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Base32'), {
      target: { value: '74======' },
    });
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('swaps input and output content', async () => {
    render(<Base32Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'foo' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));
    expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('foo');
    });
  });

  it('clears all input, output, and errors', async () => {
    render(<Base32Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'hello' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).not.toHaveValue('');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base32')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Base32Tool Clipboard', () => {
  it('announces copy status to screen readers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Base32Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'foo' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
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

    render(<Base32Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'foo' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to copy to clipboard.'
    );
  });
});

describe('Base32Tool File Upload & Stale Reads', () => {
  it('clears file label when switching mode', async () => {
    render(<Base32Tool />);
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base32');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('📁 test.txt (5 B)');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    expect(screen.getByLabelText('Base32')).toHaveValue('');
  });

  it('ignores file read resolving after Clear', async () => {
    const deferred = createDeferred();
    base32Utils.fileToBase32.mockReturnValueOnce(deferred.promise);

    render(<Base32Tool />);
    const file = new File(['hello'], 'old.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base32');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve('NBSWY3DP');
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base32')).toHaveValue('');
  });

  it('updates file output when clicking Unpadded option', async () => {
    render(<Base32Tool />);
    const file = new File(['foo'], 'foo.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base32');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unpadded' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6');
      expect(screen.getByLabelText('Base32').value).not.toContain('=');
    });
  });

  it('resets file input value allowing re-selection of the same file', async () => {
    render(<Base32Tool />);
    const file = new File(['foo'], 'foo.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base32');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });

    expect(fileInput.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Text')).toHaveValue('');

    await act(async () => selectFile(fileInput, file));
    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });
  });

  it('hides input format toggles when a file is loaded', async () => {
    render(<Base32Tool />);
    expect(screen.getByRole('group', { name: 'Input format' })).toBeInTheDocument();

    const file = new File(['foo'], 'foo.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base32');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('📁 foo.txt (3 B)');
    });

    expect(screen.queryByRole('group', { name: 'Input format' })).not.toBeInTheDocument();
  });

  it('clears output and disables Copy button while a file read is pending', async () => {
    const deferred = createDeferred();
    base32Utils.fileToBase32.mockReturnValueOnce(deferred.promise);

    render(<Base32Tool />);
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'foo' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Base32')).toHaveValue('MZXW6===');
    });

    const file = new File(['big data'], 'big.bin', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Convert a file to Base32');
    selectFile(fileInput, file);

    expect(screen.getByLabelText('Base32')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();

    await act(async () => {
      deferred.resolve('NBSWY3DP');
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Base32')).toHaveValue('NBSWY3DP');
    expect(screen.getByRole('button', { name: 'Copy' })).not.toBeDisabled();
  });
});

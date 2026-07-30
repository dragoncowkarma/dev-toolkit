import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HashTool from './HashTool.jsx';
import * as hashUtils from './hash.utils.js';

vi.mock('./hash.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hashFile: vi.fn(actual.hashFile),
    hashText: vi.fn(actual.hashText),
  };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function dropFile(dropzone, file) {
  fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
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

describe('HashTool real-time text hashing', () => {
  it('computes all four algorithm digests as the user types', async () => {
    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });

    await waitFor(() =>
      expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
        '5d41402abc4b2a76b9719d911017c592'
      )
    );
    expect(screen.getByLabelText('SHA-1 hash')).toHaveTextContent(
      'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
    );
    expect(screen.getByLabelText('SHA-256 hash')).toHaveTextContent(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
    expect(screen.getByLabelText('SHA-512 hash')).not.toHaveTextContent('—');
  });

  it('clears results when the input becomes empty', async () => {
    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('MD5 hash')).not.toHaveTextContent('—'));

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByLabelText('MD5 hash')).toHaveTextContent('—'));
  });
});

describe('HashTool pending request handling', () => {
  it('clears the previous digest while a new text request is pending', async () => {
    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() =>
      expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
        '5d41402abc4b2a76b9719d911017c592'
      )
    );

    const deferred = createDeferred();
    hashUtils.hashText.mockReturnValueOnce(deferred.promise);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'world' } });

    // The old MD5 digest must disappear immediately, before the new request
    // resolves, so it can never be read or copied while a request is pending.
    expect(screen.getByLabelText('MD5 hash')).not.toHaveTextContent(
      '5d41402abc4b2a76b9719d911017c592'
    );
    expect(screen.getByLabelText('MD5 hash')).toHaveTextContent('Computing…');
    expect(screen.getByRole('button', { name: 'Copy MD5 hash' })).toBeDisabled();

    await act(async () => {
      deferred.resolve('deadbeef');
      await Promise.resolve();
    });
  });

  it('clears the previous digest while a new file request is pending', async () => {
    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() =>
      expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
        '5d41402abc4b2a76b9719d911017c592'
      )
    );

    const deferred = createDeferred();
    hashUtils.hashFile.mockReturnValueOnce(deferred.promise);

    const file = new File(['world'], 'greeting.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Compute a hash for a file');
    selectFile(fileInput, file);

    expect(screen.getByLabelText('MD5 hash')).not.toHaveTextContent(
      '5d41402abc4b2a76b9719d911017c592'
    );
    expect(screen.getByLabelText('MD5 hash')).toHaveTextContent('Computing…');
    expect(screen.getByRole('button', { name: 'Copy MD5 hash' })).toBeDisabled();

    await act(async () => {
      deferred.resolve('deadbeef');
      await Promise.resolve();
    });
  });
});

describe('HashTool output format', () => {
  it('toggles between lowercase and uppercase hex', async () => {
    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() =>
      expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
        '5d41402abc4b2a76b9719d911017c592'
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'UPPERCASE' }));

    expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
      '5D41402ABC4B2A76B9719D911017C592'
    );
  });
});

describe('HashTool file hashing', () => {
  it('hashes a selected file and shows its name and size', async () => {
    render(<HashTool />);

    const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Compute a hash for a file');
    await act(async () => selectFile(fileInput, file));

    expect(screen.getByText('📁 greeting.txt')).toBeInTheDocument();
    expect(screen.getByText('5 B')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
        '5d41402abc4b2a76b9719d911017c592'
      )
    );
  });

  it('hashes a file dropped onto the dropzone', async () => {
    render(<HashTool />);

    const file = new File(['hello'], 'dropped.txt', { type: 'text/plain' });
    const dropzone = screen.getByLabelText('Text').closest('.hash-dropzone');
    await act(async () => dropFile(dropzone, file));

    expect(screen.getByText('📁 dropped.txt')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('MD5 hash')).toHaveTextContent(
        '5d41402abc4b2a76b9719d911017c592'
      )
    );
  });

  it('removes the file and returns to text mode', async () => {
    render(<HashTool />);

    const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Compute a hash for a file');
    await act(async () => selectFile(fileInput, file));

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('MD5 hash')).toHaveTextContent('—');
  });

  it('ignores a file read that resolves after Clear', async () => {
    const deferred = createDeferred();
    hashUtils.hashFile.mockReturnValueOnce(deferred.promise);

    render(<HashTool />);

    const file = new File(['hello'], 'old.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Compute a hash for a file');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve('deadbeef');
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('MD5 hash')).toHaveTextContent('—');
  });
});

describe('HashTool copy behavior', () => {
  it('copies the formatted hash for a single algorithm row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('MD5 hash')).not.toHaveTextContent('—'));

    const md5Row = screen.getByLabelText('MD5 hash').closest('.hash-result-row');
    await act(async () => {
      fireEvent.click(within(md5Row).getByRole('button', { name: 'Copy MD5 hash' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('5d41402abc4b2a76b9719d911017c592');
    expect(within(md5Row).getByRole('button', { name: 'MD5 hash copied' })).toBeInTheDocument();

    const shaRow = screen.getByLabelText('SHA-1 hash').closest('.hash-result-row');
    expect(within(shaRow).getByRole('button', { name: 'Copy SHA-1 hash' })).toBeInTheDocument();
  });

  it('gives every per-algorithm copy control a distinct accessible name', async () => {
    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('MD5 hash')).not.toHaveTextContent('—'));

    // Every algorithm's Copy control must resolve to exactly one button with
    // a name unique to that algorithm, not a shared generic "Copy" name.
    const copyButtonNames = hashUtils.ALGORITHMS.map((algorithm) => `Copy ${algorithm} hash`);
    expect(new Set(copyButtonNames).size).toBe(hashUtils.ALGORITHMS.length);

    copyButtonNames.forEach((name) => {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    });
  });

  it('reports a copy failure without crashing', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HashTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('MD5 hash')).not.toHaveTextContent('—'));

    const md5Row = screen.getByLabelText('MD5 hash').closest('.hash-result-row');
    await act(async () => {
      fireEvent.click(within(md5Row).getByRole('button', { name: 'Copy MD5 hash' }));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });
});

describe('HashTool navigation', () => {
  it('does not render a Back control when no onBack handler is provided', () => {
    render(<HashTool />);
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });

  it('invokes onBack when the Back control is clicked', () => {
    const onBack = vi.fn();
    render(<HashTool onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

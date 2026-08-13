import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base64Tool from './Base64Tool.jsx';
import * as base64Utils from './base64.utils.js';

vi.mock('./base64.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fileToBase64: vi.fn(actual.fileToBase64) };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Base64Tool file/mode transition', () => {
  it('clears the uploaded-file label instead of decoding it when leaving file mode', async () => {
    render(<Base64Tool />);

    const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base64');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() =>
      expect(screen.getByLabelText('Text')).toHaveValue('📁 greeting.txt (5 B)')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));

    expect(screen.getByLabelText('Base64')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Base64Tool clipboard status announcement', () => {
  it('does not render a copy status before copying', () => {
    render(<Base64Tool />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces copied status once in a polite live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Base64Tool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base64')).toHaveValue('aGVsbG8='));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute('aria-live', 'polite');
    expect(statuses[0]).toHaveTextContent('Copied to clipboard');
  });

  it('removes the copied status after the confirmation timeout', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

    render(<Base64Tool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base64')).toHaveValue('aGVsbG8='));
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reports a copy failure without disabling a valid Swap', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<Base64Tool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base64')).toHaveValue('aGVsbG8='));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⇅ Swap' })).not.toBeDisabled();
  });
});

describe('Base64Tool stale file-read handling', () => {
  it('ignores a file read that resolves after Clear', async () => {
    const deferred = createDeferred();
    base64Utils.fileToBase64.mockReturnValueOnce(deferred.promise);

    render(<Base64Tool />);

    const file = new File(['hello'], 'old.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Convert a file to Base64');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve('aGVsbG8=');
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base64')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies only the latest file selection when an older read resolves last', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    base64Utils.fileToBase64
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<Base64Tool />);

    const fileInput = screen.getByLabelText('Convert a file to Base64');
    const oldFile = new File(['a'], 'old.txt', { type: 'text/plain' });
    const newFile = new File(['bb'], 'new.txt', { type: 'text/plain' });

    selectFile(fileInput, oldFile);
    selectFile(fileInput, newFile);

    await act(async () => {
      deferredNew.resolve('Yg==');
      await Promise.resolve();
    });
    await act(async () => {
      deferredOld.resolve('YQ==');
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Text')).toHaveValue('📁 new.txt (2 B)');
    expect(screen.getByLabelText('Base64')).toHaveValue('Yg==');
  });
});

describe('Base64Tool navigation', () => {
  it('does not render a Back control, since Base64 is the dashboard home tool', () => {
    render(<Base64Tool />);
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });
});

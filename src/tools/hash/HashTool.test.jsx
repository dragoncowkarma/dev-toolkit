import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HashTool from './HashTool.jsx';
import * as hashUtils from './hash.utils.js';

vi.mock('./hash.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hashData: vi.fn(),
    hashText: vi.fn(),
  };
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
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('HashTool live text hashing', () => {
  it('shows all selected algorithm results as the user types', async () => {
    hashUtils.hashText.mockImplementation(
      async (text, algorithm, format) => `${algorithm}:${format}:${text}`
    );

    render(<HashTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'hello' },
    });

    for (const algorithm of hashUtils.HASH_ALGORITHMS) {
      await waitFor(() =>
        expect(screen.getByLabelText(`${algorithm} result`)).toHaveTextContent(
          `${algorithm}:hex:hello`
        )
      );
    }
    expect(hashUtils.hashText).toHaveBeenCalledTimes(4);
  });

  it('recalculates selected results in Base64 format', async () => {
    hashUtils.hashText.mockImplementation(
      async (text, algorithm, format) => `${format}:${algorithm}:${text}`
    );

    render(<HashTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'hello' },
    });
    await screen.findByText('hex:SHA-256:hello');

    fireEvent.click(screen.getByLabelText('Base64'));

    expect(await screen.findByText('base64:SHA-256:hello')).toBeInTheDocument();
  });

  it('can remove an algorithm from simultaneous hashing', async () => {
    hashUtils.hashText.mockImplementation(
      async (text, algorithm) => `${algorithm}:${text}`
    );

    render(<HashTool />);
    fireEvent.click(screen.getByLabelText('SHA-1'));
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'hello' },
    });

    await screen.findByText('SHA-256:hello');
    expect(screen.queryByLabelText('SHA-1 result')).not.toBeInTheDocument();
    expect(hashUtils.hashText).not.toHaveBeenCalledWith('hello', 'SHA-1', 'hex');
  });

  it('does not let an older live result replace the latest input result', async () => {
    const oldHash = createDeferred();
    const newHash = createDeferred();
    hashUtils.hashText.mockImplementation((text) =>
      text === 'old' ? oldHash.promise : newHash.promise
    );

    render(<HashTool />);
    fireEvent.click(screen.getByLabelText('SHA-1'));
    fireEvent.click(screen.getByLabelText('SHA-384'));
    fireEvent.click(screen.getByLabelText('SHA-512'));

    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'old' },
    });
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'new' },
    });

    await act(async () => {
      newHash.resolve('new-result');
    });
    expect(await screen.findByText('new-result')).toBeInTheDocument();

    await act(async () => {
      oldHash.resolve('old-result');
    });
    expect(screen.getByLabelText('SHA-256 result')).toHaveTextContent('new-result');
  });
});

describe('HashTool file hashing', () => {
  it('reads a selected file once and hashes every selected algorithm', async () => {
    hashUtils.hashText.mockResolvedValue('text-result');
    hashUtils.hashData.mockImplementation(
      async (contents, algorithm) => `${algorithm}:${contents.byteLength}`
    );

    render(<HashTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'old text' },
    });

    const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
    const arrayBuffer = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode('hello').buffer);
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer });
    selectFile(screen.getByLabelText('Upload a file to hash'), file);

    expect(screen.getByLabelText('Input text')).toHaveValue('');
    expect(await screen.findByText('SHA-512:5')).toBeInTheDocument();
    expect(screen.getByText('greeting.txt (5 B)')).toBeInTheDocument();
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(hashUtils.hashData).toHaveBeenCalledTimes(4);
  });
});

describe('HashTool clipboard behavior', () => {
  it('copies an individual algorithm result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    hashUtils.hashText.mockImplementation(
      async (text, algorithm) => `${algorithm}:${text}`
    );

    render(<HashTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'hello' },
    });

    await screen.findByText('SHA-256:hello');
    const copyButton = await screen.findByRole('button', {
      name: 'Copy SHA-256 hash',
    });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith('SHA-256:hello');
    expect(copyButton).toHaveTextContent('Copied');
  });

  it('reports clipboard permission failures without removing hash results', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    hashUtils.hashText.mockImplementation(
      async (text, algorithm) => `${algorithm}:${text}`
    );

    render(<HashTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'hello' },
    });

    await screen.findByText('SHA-256:hello');
    const copyButton = await screen.findByRole('button', {
      name: 'Copy SHA-256 hash',
    });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy');
    expect(screen.getByLabelText('SHA-256 result')).toHaveTextContent('SHA-256:hello');
  });
});

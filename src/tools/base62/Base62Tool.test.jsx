import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Base62Tool from './Base62Tool.jsx';
import * as base62Utils from './base62.utils.js';

vi.mock('./base62.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fileToBytes: vi.fn(actual.fileToBytes) };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('Base62Tool', () => {
  it('encodes text and exposes accessible conversion errors', async () => {
    render(<Base62Tool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base62')).not.toHaveValue(''));

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Base62'), { target: { value: 'invalid+' } });

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Invalid Base62 character');
    expect(screen.getByLabelText('Base62')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Base62')).toHaveAttribute('aria-describedby', 'base62-error');
  });

  it('keeps decoded binary bytes available for download', async () => {
    render(<Base62Tool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Base62'), { target: { value: '47' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('binary');
    expect(screen.getByRole('button', { name: 'Download bytes' })).toBeInTheDocument();
  });

  it('ignores a file read that resolves after Clear', async () => {
    let resolveRead;
    base62Utils.fileToBytes.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );
    render(<Base62Tool />);

    selectFile(
      screen.getByLabelText('Encode a file as Base62'),
      new File(['hello'], 'old.txt', { type: 'text/plain' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      resolveRead(new Uint8Array([104, 101, 108, 108, 111]));
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base62')).toHaveValue('');
  });
});

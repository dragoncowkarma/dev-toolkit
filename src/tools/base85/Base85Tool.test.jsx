import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base85Tool from './Base85Tool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Base85Tool', () => {
  it('encodes Ascii85 with a delimiter toggle and swaps to decode', async () => {
    render(<Base85Tool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Ascii85')).toHaveValue('<~BOu!rDZ~>');
    });

    fireEvent.click(screen.getByLabelText('Wrap with <~ ~>'));
    expect(screen.getByLabelText('Ascii85')).toHaveValue('BOu!rDZ');

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));
    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveValue('hello'));
  });

  it('shows a non-crashing alert for malformed decode data', async () => {
    render(<Base85Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Ascii85'), { target: { value: '!' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'incomplete final group'
    );
    expect(screen.getByLabelText('Text')).toHaveValue('');
  });

  it('enforces the Z85 input length requirement in the UI', async () => {
    render(<Base85Tool />);
    fireEvent.click(screen.getByRole('button', { name: 'Z85' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'abc' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'multiple of 4 bytes'
    );
  });

  it('reports successful and failed clipboard writes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Base85Tool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'test' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');

    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to copy to clipboard.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

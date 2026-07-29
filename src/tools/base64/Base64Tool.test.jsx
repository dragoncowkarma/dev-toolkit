import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base64Tool from './Base64Tool.jsx';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
});

describe('Base64Tool file/mode transition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears the uploaded-file label instead of decoding it when leaving file mode', async () => {
    render(<Base64Tool onBack={() => {}} />);

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

describe('Base64Tool clipboard error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a copy failure without disabling a valid Swap', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<Base64Tool onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base64')).toHaveValue('aGVsbG8='));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
    expect(screen.getByRole('button', { name: '⇅ Swap' })).not.toBeDisabled();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base91Tool from './Base91Tool.jsx';
import * as base91Utils from './base91.utils.js';

vi.mock('./base91.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fileToBase91: vi.fn(actual.fileToBase91) };
});

let restoreClipboard = () => {};

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function setClipboard(writeText) {
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.assign(navigator, { clipboard: { writeText } });
  restoreClipboard = () => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      return;
    }
    delete navigator.clipboard;
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreClipboard();
  restoreClipboard = () => {};
});

describe('Base91Tool', () => {
  it('encodes text and exposes decoding errors to assistive technology', async () => {
    render(<Base91Tool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base91')).toHaveValue('TPwJh>A'));

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Base91'), { target: { value: 'invalid space' } });

    const input = screen.getByLabelText('Base91');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('id', 'base91-error');
    expect(alert).toHaveTextContent(/Invalid Base91 input/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'base91-error');
  });

  it('toggles between Encode and Decode modes', () => {
    render(<Base91Tool />);

    const encodeButton = screen.getByRole('button', { name: 'Encode' });
    const decodeButton = screen.getByRole('button', { name: 'Decode' });
    expect(encodeButton).toHaveAttribute('aria-pressed', 'true');
    expect(decodeButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Text')).toHaveAttribute('id', 'base91-input');

    fireEvent.click(decodeButton);
    expect(encodeButton).toHaveAttribute('aria-pressed', 'false');
    expect(decodeButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Base91')).toHaveAttribute('id', 'base91-input');
    expect(screen.getByLabelText('Text')).toHaveAttribute('id', 'base91-output');

    fireEvent.click(encodeButton);
    expect(encodeButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Text')).toHaveAttribute('id', 'base91-input');
  });

  it('encodes uploaded files and clears stale data when a later read fails', async () => {
    base91Utils.fileToBase91
      .mockResolvedValueOnce('TPwJh>A')
      .mockRejectedValueOnce(new Error('Failed to read the selected file.'));

    render(<Base91Tool />);
    const fileInput = screen.getByLabelText('Convert a file to Base91');
    const firstFile = new File(['hello'], 'greeting.txt', { type: 'text/plain' });

    await act(async () => {
      selectFile(fileInput, firstFile);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Text')).toHaveValue('📁 greeting.txt (5 B)');
      expect(screen.getByLabelText('Base91')).toHaveValue('TPwJh>A');
    });
    expect(base91Utils.fileToBase91).toHaveBeenCalledWith(firstFile);

    const failingFile = new File(['broken'], 'broken.txt', { type: 'text/plain' });
    await act(async () => {
      selectFile(fileInput, failingFile);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to read the selected file.');
    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base91')).toHaveValue('');
  });

  it('copies output and clears all toolbar state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    render(<Base91Tool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base91')).toHaveValue('TPwJh>A'));

    const copyButton = screen.getByRole('button', { name: 'Copy' });
    await act(async () => {
      fireEvent.click(copyButton);
    });
    expect(writeText).toHaveBeenCalledWith('TPwJh>A');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Base91')).toHaveValue('');
    expect(copyButton).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

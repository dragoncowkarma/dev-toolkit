import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SlugTool from './SlugTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SlugTool Component', () => {
  it('regenerates the slug in real time on text input change', async () => {
    render(<SlugTool />);
    const inputArea = screen.getByLabelText('Input text');

    fireEvent.change(inputArea, { target: { value: 'Café — 2026 Résumé!' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Generated slug')).toHaveValue('cafe-2026-resume');
    });
  });

  it('switches separator between hyphen and underscore in real time', async () => {
    render(<SlugTool />);
    const inputArea = screen.getByLabelText('Input text');
    const separatorSelect = screen.getByLabelText('Separator selector');

    fireEvent.change(inputArea, { target: { value: 'Hello World Test' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Generated slug')).toHaveValue('hello-world-test');
    });

    fireEvent.change(separatorSelect, { target: { value: '_' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Generated slug')).toHaveValue('hello_world_test');
    });
  });

  it('applies max-length truncation without dangling separators', async () => {
    render(<SlugTool />);
    const inputArea = screen.getByLabelText('Input text');
    const maxLengthInput = screen.getByLabelText('Maximum length numeric input');

    fireEvent.change(inputArea, { target: { value: 'Hello World Example' } });
    fireEvent.change(maxLengthInput, { target: { value: '12' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Generated slug')).toHaveValue('hello-world');
    });
  });

  it('handles copy-to-clipboard success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SlugTool />);
    const inputArea = screen.getByLabelText('Input text');
    const copyButton = screen.getByRole('button', { name: 'Copy generated slug' });

    expect(copyButton).toBeDisabled();

    fireEvent.change(inputArea, { target: { value: 'Awesome Product Title' } });

    await waitFor(() => {
      expect(copyButton).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith('awesome-product-title');
    expect(screen.getByRole('status')).toHaveTextContent('Copied slug to clipboard!');
  });

  it('handles copy-to-clipboard failure feedback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard error'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SlugTool />);
    const inputArea = screen.getByLabelText('Input text');
    const copyButton = screen.getByRole('button', { name: 'Copy generated slug' });

    fireEvent.change(inputArea, { target: { value: 'Awesome Product Title' } });

    await waitFor(() => {
      expect(copyButton).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith('awesome-product-title');
    expect(screen.getByRole('status')).toHaveTextContent('Failed to copy slug to clipboard.');
  });
});

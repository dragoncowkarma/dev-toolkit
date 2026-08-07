import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WordCounterTool from './WordCounterTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WordCounterTool Component', () => {
  it('renders initial empty state with 0 metrics', () => {
    render(<WordCounterTool />);

    expect(screen.getByLabelText('Input text')).toHaveValue('');
    expect(screen.getByTestId('stat-words')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-characters')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-characters-no-spaces')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-sentences')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-paragraphs')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-reading-time')).toHaveTextContent('0 min read');
    expect(screen.getByTestId('stat-byte-size')).toHaveTextContent('0 B');
    expect(screen.getByRole('button', { name: 'Clear input text' })).toBeDisabled();
  });

  it('updates statistics metrics in real time when typing', () => {
    render(<WordCounterTool />);

    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'Hello world. How are you?\n\nI am fine.' },
    });

    expect(screen.getByTestId('stat-words')).toHaveTextContent('8');
    expect(screen.getByTestId('stat-characters')).toHaveTextContent('37');
    expect(screen.getByTestId('stat-characters-no-spaces')).toHaveTextContent('29');
    expect(screen.getByTestId('stat-sentences')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-paragraphs')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-reading-time')).toHaveTextContent('1 min read');
    expect(screen.getByTestId('stat-byte-size')).toHaveTextContent('37 B');
  });

  it('clears text input and resets metrics when Clear button is clicked', () => {
    render(<WordCounterTool />);

    const input = screen.getByLabelText('Input text');
    fireEvent.change(input, { target: { value: 'Test text' } });
    expect(screen.getByTestId('stat-words')).toHaveTextContent('2');

    const clearButton = screen.getByRole('button', { name: 'Clear input text' });
    expect(clearButton).not.toBeDisabled();

    fireEvent.click(clearButton);

    expect(input).toHaveValue('');
    expect(screen.getByTestId('stat-words')).toHaveTextContent('0');
    expect(screen.getByRole('status')).toHaveTextContent('Text cleared.');
  });

  it('copies stats summary to clipboard and shows success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<WordCounterTool />);

    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'Testing copy stats.' },
    });

    const copyButton = screen.getByRole('button', { name: 'Copy stats summary' });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Words: 3, Characters (with spaces): 19')
    );
    expect(screen.getByRole('status')).toHaveTextContent('Stats copied to clipboard.');
  });

  it('shows error feedback when clipboard copy fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<WordCounterTool />);

    const copyButton = screen.getByRole('button', { name: 'Copy stats summary' });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Unable to copy stats to clipboard.');
  });
});

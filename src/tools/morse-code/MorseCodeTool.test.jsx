import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MorseCodeTool from './MorseCodeTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MorseCodeTool auto-detect', () => {
  it('encodes plain text to Morse code by default', async () => {
    render(<MorseCodeTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'SOS' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Morse Code')).toHaveValue('... --- ...')
    );
  });

  it('auto-detects Morse input and decodes it to text', async () => {
    render(<MorseCodeTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '... --- ...' } });

    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveValue('SOS'));
  });
});

describe('MorseCodeTool manual mode toggle', () => {
  it('forces encode mode even for Morse-shaped input', async () => {
    render(<MorseCodeTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Encode' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '... ---' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Morse Code')).toHaveValue(
        '.-.-.- .-.-.- .-.-.- / -....- -....- -....-'
      )
    );
  });

  it('forces decode mode and reports an invalid token error', async () => {
    render(<MorseCodeTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Morse Code'), { target: { value: '.......' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Morse code token');
  });
});

describe('MorseCodeTool errors', () => {
  it('shows a non-crashing error for unsupported characters when encoding', async () => {
    render(<MorseCodeTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Encode' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'café' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported character');
    expect(screen.getByLabelText('Morse Code')).toHaveValue('');
  });

  it('clears output and error for empty input', async () => {
    render(<MorseCodeTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'SOS' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Morse Code')).toHaveValue('... --- ...')
    );

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '' } });

    expect(screen.getByLabelText('Morse Code')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MorseCodeTool copy and swap', () => {
  it('copies the output to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MorseCodeTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'HI' } });
    await waitFor(() => expect(screen.getByLabelText('Morse Code')).toHaveValue('.... ..'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('.... ..');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('swaps input and output, flipping the manual mode', async () => {
    render(<MorseCodeTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Encode' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'HI' } });
    await waitFor(() => expect(screen.getByLabelText('Morse Code')).toHaveValue('.... ..'));

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));

    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveValue('HI'));
  });
});

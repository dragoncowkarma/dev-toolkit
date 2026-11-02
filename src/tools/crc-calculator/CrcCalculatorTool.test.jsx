import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CrcCalculatorTool from './CrcCalculatorTool.jsx';
import { MAX_INPUT_BYTES } from './crc.utils.js';

describe('CrcCalculatorTool', () => {
  afterEach(() => cleanup());

  it('calculates and copies CRC values for text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CrcCalculatorTool />);

    fireEvent.change(screen.getByLabelText('Text input'), { target: { value: '123456789' } });

    expect(screen.getByText('0xF4')).toBeInTheDocument();
    expect(screen.getByText('0x29B1')).toBeInTheDocument();
    expect(screen.getByText('0xCBF43926')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[2]));

    expect(writeText).toHaveBeenCalledWith('0xCBF43926');
    expect(screen.getByText('Checksum copied to clipboard.')).toBeInTheDocument();
  });

  it('calculates checksums from raw uploaded file bytes', async () => {
    render(<CrcCalculatorTool />);
    const file = new File([new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57])], 'bytes.bin');
    const input = screen.getByLabelText('Choose a file to calculate checksums');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText('0xCBF43926')).toBeInTheDocument());
    expect(screen.getByText('File: bytes.bin (9 B)')).toBeInTheDocument();
  });

  it('shows an error instead of processing an oversized uploaded file', async () => {
    render(<CrcCalculatorTool />);
    const file = new File([new Uint8Array(MAX_INPUT_BYTES + 1)], 'large.bin');
    const input = screen.getByLabelText('Choose a file to calculate checksums');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'File is too large. Choose a file up to 256.0 KB.'
    );
  });
});

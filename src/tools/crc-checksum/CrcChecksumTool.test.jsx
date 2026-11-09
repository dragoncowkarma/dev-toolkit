import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CrcChecksumTool from './CrcChecksumTool.jsx';
import { MAX_INPUT_BYTES } from './crcChecksum.utils.js';

describe('CrcChecksumTool', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches between text and hex input while calculating selected algorithms', () => {
    render(<CrcChecksumTool />);
    fireEvent.change(screen.getByLabelText('Text input'), { target: { value: '123456789' } });
    expect(screen.getByLabelText('CRC-32 (IEEE 802.3) result')).toHaveTextContent('CBF43926');

    fireEvent.click(screen.getByLabelText('Hex bytes'));
    fireEvent.change(screen.getByLabelText('Hexadecimal bytes'), { target: { value: '31 32 33' } });
    fireEvent.click(screen.getByLabelText('Adler-32'));
    expect(screen.queryByLabelText('Adler-32 result')).not.toBeInTheDocument();
  });

  it('loads the known-vector sample and reports invalid hex accessibly', () => {
    render(<CrcChecksumTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load 123456789 sample' }));
    expect(screen.getByLabelText('Text input')).toHaveValue('123456789');
    fireEvent.click(screen.getByLabelText('Hex bytes'));
    fireEvent.change(screen.getByLabelText('Hexadecimal bytes'), { target: { value: 'a' } });
    expect(screen.getByRole('alert')).toHaveTextContent('even number');
  });

  it('shows copy feedback for each result', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CrcChecksumTool />);
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('rejects oversized pasted text with an accessible alert and skips computing results', () => {
    render(<CrcChecksumTool />);
    const textarea = screen.getByLabelText('Text input');
    const oversizedText = 'a'.repeat(MAX_INPUT_BYTES + 1);

    fireEvent.change(textarea, { target: { value: oversizedText } });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('too long');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', alert.id);
    expect(screen.queryByLabelText('CRC-32 (IEEE 802.3) result')).not.toBeInTheDocument();
  });

  it('clears the size-limit error once the text is edited back within the limit', () => {
    render(<CrcChecksumTool />);
    const textarea = screen.getByLabelText('Text input');
    const oversizedText = 'a'.repeat(MAX_INPUT_BYTES + 1);

    fireEvent.change(textarea, { target: { value: oversizedText } });
    expect(screen.getByRole('alert')).toHaveTextContent('too long');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(textarea, { target: { value: '123456789' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('CRC-32 (IEEE 802.3) result')).toHaveTextContent('CBF43926');
  });
});

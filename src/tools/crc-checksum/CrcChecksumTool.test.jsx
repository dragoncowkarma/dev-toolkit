import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CrcChecksumTool from './CrcChecksumTool.jsx';

describe('CrcChecksumTool', () => {
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
});

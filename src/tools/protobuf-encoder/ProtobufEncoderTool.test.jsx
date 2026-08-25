import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProtobufEncoderTool from './ProtobufEncoderTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProtobufEncoderTool', () => {
  it('renders encoded output and reports invalid JSON inline', () => {
    render(<ProtobufEncoderTool />);

    expect(screen.getByLabelText('Hex')).toHaveValue(
      '08 96 01 12 05 48 65 6c 6c 6f 1d 2a 00 00 00',
    );

    fireEvent.change(screen.getByLabelText('Field definitions (JSON)'), { target: { value: '{' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');
    expect(screen.queryByLabelText('Hex')).not.toBeInTheDocument();
  });

  it('announces the copied format and clears the message after three seconds', async () => {
    vi.useFakeTimers();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ProtobufEncoderTool />);

    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '08 96 01 12 05 48 65 6c 6c 6f 1d 2a 00 00 00',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Copied Hex to clipboard.');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

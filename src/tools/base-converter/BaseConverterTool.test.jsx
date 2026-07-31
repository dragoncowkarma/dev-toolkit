import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BaseConverterTool from './BaseConverterTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BaseConverterTool', () => {
  it('renders and synchronizes all standard base inputs in real time', () => {
    render(<BaseConverterTool />);

    fireEvent.change(screen.getByLabelText('HEX'), { target: { value: 'FF' } });

    expect(screen.getByLabelText('BIN')).toHaveValue('11111111');
    expect(screen.getByLabelText('OCT')).toHaveValue('377');
    expect(screen.getByLabelText('DEC')).toHaveValue('255');
    expect(screen.getByLabelText('HEX')).toHaveValue('FF');
  });

  it('reports invalid input without erasing the entered field', () => {
    render(<BaseConverterTool />);

    fireEvent.change(screen.getByLabelText('BIN'), { target: { value: '102' } });

    expect(screen.getByLabelText('BIN')).toHaveValue('102');
    expect(screen.getByRole('alert')).toHaveTextContent('BIN accepts valid base-2 digits only.');
  });

  it('toggles an individual bit and updates synchronized fields', () => {
    render(<BaseConverterTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle bit 0 in 8-bit view' }));

    expect(screen.getByLabelText('DEC')).toHaveValue('1');
    expect(screen.getByLabelText('HEX')).toHaveValue('1');
  });

  it('copies a field value to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BaseConverterTool />);

    fireEvent.change(screen.getByLabelText('DEC'), { target: { value: '42' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy HEX' })));

    expect(writeText).toHaveBeenCalledWith('2A');
    expect(screen.getByRole('button', { name: 'HEX copied' })).toBeInTheDocument();
  });
});

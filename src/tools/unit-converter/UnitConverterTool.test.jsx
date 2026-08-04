import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UnitConverterTool from './UnitConverterTool.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('UnitConverterTool', () => {
  it('converts input values in real time', () => {
    render(<UnitConverterTool />);
    fireEvent.change(screen.getByLabelText('Value to convert'), { target: { value: '2.5' } });
    expect(screen.getByRole('heading', { name: '0.0025' })).toBeInTheDocument();
  });

  it('swaps units and recalculates the current value', () => {
    render(<UnitConverterTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Swap units' }));
    expect(screen.getByLabelText('From unit')).toHaveValue('km');
    expect(screen.getByRole('heading', { name: '0.0010' })).toBeInTheDocument();
  });

  it('changes the result precision', () => {
    render(<UnitConverterTool />);
    fireEvent.change(screen.getByLabelText('Decimal places'), { target: { value: '2' } });
    expect(screen.getByRole('heading', { name: '1000.00' })).toBeInTheDocument();
  });

  it('reports successful and failed copy actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UnitConverterTool />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy result' })));
    expect(writeText).toHaveBeenCalledWith('1000.0000');
    expect(screen.getByText('Result copied to clipboard.')).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new Error('blocked'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy result' })));
    expect(screen.getByText('Unable to copy the result.')).toBeInTheDocument();
  });

  it('shows an accessible alert for invalid input', () => {
    render(<UnitConverterTool />);
    fireEvent.change(screen.getByLabelText('Value to convert'), { target: { value: 'abc' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid number.');
  });
});

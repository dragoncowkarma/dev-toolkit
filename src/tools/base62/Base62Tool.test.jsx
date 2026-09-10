import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Base62Tool from './Base62Tool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Base62Tool conversion', () => {
  it('encodes a decimal input and swaps the editable representation', () => {
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal input'), { target: { value: '62' } });

    expect(screen.getByLabelText('Base62 result')).toHaveValue('10');
    expect(screen.getByRole('button', { name: 'Copy' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '⇄ Swap' }));

    expect(screen.getByLabelText('Decimal result')).toHaveValue('62');
    expect(screen.getByLabelText('Base62 input')).toHaveValue('10');
    expect(screen.getByLabelText('Decimal result')).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText('Base62 input'), { target: { value: 'Z' } });

    expect(screen.getByLabelText('Decimal result')).toHaveValue('61');
  });

  it('allows decoding Base62 before entering a decimal value', () => {
    render(<Base62Tool />);

    fireEvent.click(screen.getByRole('button', { name: '⇄ Swap' }));
    const base62Input = screen.getByLabelText('Base62 input');

    expect(base62Input).not.toHaveAttribute('readonly');
    fireEvent.change(base62Input, { target: { value: 'Z' } });

    expect(screen.getByLabelText('Decimal result')).toHaveValue('61');
  });

  it('shows linked accessible validation feedback for invalid decimal input', () => {
    render(<Base62Tool />);

    const decimalInput = screen.getByLabelText('Decimal input');
    fireEvent.change(decimalInput, { target: { value: '-1' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Negative numbers cannot be encoded');
    expect(decimalInput).toHaveAttribute('aria-invalid', 'true');
    expect(decimalInput).toHaveAttribute('aria-describedby', 'base62-decimal-error');
    expect(screen.getByLabelText('Base62 result')).toHaveValue('');
  });

  it('shows linked accessible validation feedback for invalid Base62 input', () => {
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal input'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '⇄ Swap' }));
    const base62Input = screen.getByLabelText('Base62 input');
    fireEvent.change(base62Input, { target: { value: '1!' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid Base62 character "!"');
    expect(base62Input).toHaveAttribute('aria-invalid', 'true');
    expect(base62Input).toHaveAttribute('aria-describedby', 'base62-base62-error');
    expect(screen.getByLabelText('Decimal result')).toHaveValue('');
  });
});

describe('Base62Tool actions', () => {
  it('announces copied feedback through a polite live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Base62Tool />);

    fireEvent.change(screen.getByLabelText('Decimal input'), { target: { value: '62' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(writeText).toHaveBeenCalledWith('10');
  });

  it('clears values and validation feedback', () => {
    render(<Base62Tool />);

    const decimalInput = screen.getByLabelText('Decimal input');
    fireEvent.change(decimalInput, { target: { value: '1.5' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Decimal input')).toHaveValue('');
    expect(screen.getByLabelText('Base62 result')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});

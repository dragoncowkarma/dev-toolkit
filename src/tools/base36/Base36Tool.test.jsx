import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Base36Tool from './Base36Tool.jsx';

afterEach(cleanup);

describe('Base36Tool', () => {
  it('encodes a decimal integer and supports swapping its result', async () => {
    render(<Base36Tool />);

    fireEvent.change(screen.getByLabelText('Decimal integer'), { target: { value: '35' } });
    await waitFor(() => expect(screen.getByLabelText('Base36')).toHaveValue('Z'));

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));
    expect(screen.getByLabelText('Base36')).toHaveValue('Z');
    await waitFor(() => expect(screen.getByLabelText('Decimal integer')).toHaveValue('35'));
  });

  it('shows an accessible inline error for invalid input', async () => {
    render(<Base36Tool />);

    fireEvent.change(screen.getByLabelText('Decimal integer'), { target: { value: '-1' } });

    const input = screen.getByLabelText('Decimal integer');
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Enter a non-negative integer');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'base36-error');
  });

  it('decodes lowercase Base36 input', async () => {
    render(<Base36Tool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Base36'), { target: { value: 'z' } });

    await waitFor(() => expect(screen.getByLabelText('Decimal integer')).toHaveValue('35'));
  });
});

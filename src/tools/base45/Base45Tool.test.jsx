import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Base45Tool from './Base45Tool.jsx';

afterEach(cleanup);

describe('Base45Tool', () => {
  it('converts text to Base45 and swaps to decode it', async () => {
    render(<Base45Tool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'AB' } });
    await waitFor(() => expect(screen.getByLabelText('Base45')).toHaveValue('BB8'));

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveValue('AB'));
  });

  it('associates a decoding error with the invalid input', async () => {
    render(<Base45Tool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Base45'), { target: { value: 'A' } });

    const input = screen.getByLabelText('Base45');
    const error = await screen.findByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(error).toHaveTextContent('length must use three-character groups');
  });
});

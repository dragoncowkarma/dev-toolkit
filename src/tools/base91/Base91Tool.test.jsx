import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Base91Tool from './Base91Tool.jsx';

describe('Base91Tool', () => {
  it('encodes text, decodes it after swapping, and reports invalid input inline', async () => {
    render(<Base91Tool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Base91')).toHaveValue('TPwJh>A'));

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));
    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveValue('hello'));

    fireEvent.change(screen.getByLabelText('Base91'), { target: { value: 'invalid space' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid Base91 input/);
  });
});

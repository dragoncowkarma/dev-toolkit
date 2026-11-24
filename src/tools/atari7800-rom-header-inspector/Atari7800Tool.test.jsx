import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Atari7800Tool from './Atari7800Tool.jsx';
import * as utils from './header.utils.js';

vi.mock('./header.utils.js', async (original) => ({
  ...await original(),
  readHeader: vi.fn(),
}));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('reports malformed hex and invalid signatures', () => {
  render(<Atari7800Tool />);
  const input = screen.getByLabelText('Hex bytes');
  fireEvent.change(input, { target: { value: '0g' } });
  expect(screen.getByRole('alert')).toHaveTextContent('hexadecimal');
  fireEvent.change(input, { target: { value: '00 '.repeat(10) } });
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid ATARI7800');
});

it('ignores a stale file result after newer hex input', async () => {
  let resolve;
  utils.readHeader.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<Atari7800Tool />);
  fireEvent.change(screen.getByLabelText('ROM file'), {
    target: { files: [new File(['old'], 'old.a78')] },
  });
  fireEvent.change(screen.getByLabelText('Hex bytes'), { target: { value: '03' } });
  await act(async () => { resolve(new Uint8Array([9])); });
  expect(screen.getByText('Version').nextSibling).toHaveTextContent('3');
  expect(screen.queryByText('Selected: old.a78')).not.toBeInTheDocument();
});

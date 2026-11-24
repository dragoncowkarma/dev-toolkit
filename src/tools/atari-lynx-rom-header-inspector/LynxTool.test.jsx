import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LynxTool from './LynxTool.jsx';

afterEach(cleanup);

it('renders parsed and malformed hex safely', () => {
  render(<LynxTool />);
  const input = screen.getByLabelText(/header hex/i);
  fireEvent.change(input, { target: { value: '4c 59 4e 58' } });
  expect(screen.getByText('LYNX')).toBeInTheDocument();
  expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  fireEvent.change(input, { target: { value: '00 00 00 00' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/invalid magic/i);
  fireEvent.change(input, { target: { value: 'xyz' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i);
});

it('reads only 64 bytes and ignores an older file read after hex input', async () => {
  let resolve;
  const arrayBuffer = vi.fn(() => new Promise((done) => { resolve = done; }));
  const slice = vi.fn(() => ({ arrayBuffer }));
  render(<LynxTool />);
  fireEvent.change(screen.getByLabelText('LNX file'), { target: { files: [{ slice }] } });
  expect(slice).toHaveBeenCalledWith(0, 64);
  fireEvent.change(screen.getByLabelText(/header hex/i), { target: { value: '4c 59 4e 58' } });
  await act(async () => { resolve(new Uint8Array([0, 0, 0, 0]).buffer); });
  expect(screen.getByText('LYNX')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, it, expect } from 'vitest';
import ZfsLabelTool from './ZfsLabelTool.jsx';

afterEach(cleanup);

it('shows alerts for empty, short, and non-ZFS hex input', () => {
  render(<ZfsLabelTool />);
  const input = screen.getByLabelText(/paste label hex/i);
  const button = screen.getByRole('button', { name: /inspect hex/i });
  fireEvent.click(button);
  expect(screen.getByRole('alert')).toHaveTextContent(/empty/i);
  fireEvent.change(input, { target: { value: '00' } });
  fireEvent.click(button);
  expect(screen.getByRole('alert')).toHaveTextContent(/short/i);
  fireEvent.change(input, { target: { value: '00'.repeat(256 * 1024) } });
  fireEvent.click(button);
  expect(screen.getByRole('alert')).toHaveTextContent(/ZFS/i);
});

it('ignores a file read after newer hex input', async () => {
  let finish;
  const file = new File(['x'], 'label');
  Object.defineProperty(file, 'size', { value: 256 * 1024 });
  file.slice = () => ({ arrayBuffer: () => new Promise((resolve) => { finish = resolve; }) });
  render(<ZfsLabelTool />);
  fireEvent.change(screen.getByLabelText(/select a file/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/paste label hex/i), { target: { value: '00' } });
  fireEvent.click(screen.getByRole('button', { name: /inspect hex/i }));
  finish(new ArrayBuffer(256 * 1024));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/short/i));
});

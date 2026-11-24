import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Ocfs2Tool from './Ocfs2Tool.jsx';

it('does not let a stale file read overwrite a newer hex result', async () => {
  let finish;
  const file = { slice: vi.fn(() => ({
    arrayBuffer: () => new Promise((resolve) => { finish = resolve; }),
  })) };
  render(<Ocfs2Tool />);
  fireEvent.change(screen.getByLabelText('Disk image'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/hex-encoded/), { target: { value: 'xyz' } });
  fireEvent.click(screen.getByText('Inspect hex'));
  expect(await screen.findByRole('alert')).toHaveTextContent('hexadecimal');
  finish(new Uint8Array([79, 67, 70, 83, 86, 50]).buffer);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('hexadecimal'));
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Tool from './LinuxMdRaidSuperblockInspectorTool.jsx';
import * as utils from './md.utils.js';

vi.mock('./md.utils.js', async (original) => ({
  ...await original(), inspectFile: vi.fn(),
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('selects a file, edits hex, and clears the result', async () => {
  utils.inspectFile.mockResolvedValue({ fields: { Level: 'raid1' } });
  render(<Tool />);
  const file = new File(['x'], 'device.img');
  await act(async () => fireEvent.change(screen.getByLabelText(/choose or drop/i), {
    target: { files: [file] },
  }));
  expect(screen.getByText('raid1')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Superblock hex'), { target: { value: '00' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Incomplete');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.getByLabelText('Superblock hex')).toHaveValue('');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('discards a file read completed after text editing', async () => {
  let resolve;
  utils.inspectFile.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<Tool />);
  fireEvent.change(screen.getByLabelText(/choose or drop/i), {
    target: { files: [new File(['x'], 'device.img')] },
  });
  fireEvent.change(screen.getByLabelText('Superblock hex'), { target: { value: '00' } });
  await act(async () => resolve({ fields: { Level: 'raid1' } }));
  expect(screen.queryByText('raid1')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Incomplete');
});

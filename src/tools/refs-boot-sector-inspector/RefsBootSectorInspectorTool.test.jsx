import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RefsBootSectorInspectorTool from './RefsBootSectorInspectorTool.jsx';
import * as utils from './refs.utils.js';

vi.mock('./refs.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFilePrefix: vi.fn(actual.readFilePrefix) };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('reads a bounded prefix', async () => {
  const file = new File([new Uint8Array(8000)], 'image');
  const slice = vi.spyOn(file, 'slice');
  await utils.readFilePrefix(file);
  expect(slice).toHaveBeenCalledWith(0, 4096);
});

it('ignores an older read and shows errors from the latest dropped file', async () => {
  let resolveOld;
  const oldRead = new Promise((resolve) => { resolveOld = resolve; });
  utils.readFilePrefix.mockReturnValueOnce(oldRead).mockResolvedValueOnce(new ArrayBuffer(10));
  render(<RefsBootSectorInspectorTool />);
  const input = screen.getByLabelText('Choose a ReFS image');
  fireEvent.change(input, { target: { files: [new File(['a'], 'old')] } });
  fireEvent.drop(screen.getByText(/Drop a ReFS/).parentElement, {
    dataTransfer: { files: [new File(['b'], 'new')] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Truncated');
  await act(async () => { resolveOld(new ArrayBuffer(512)); });
  expect(screen.getByRole('alert')).toHaveTextContent('Truncated');
  expect(screen.getByText('File: new')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

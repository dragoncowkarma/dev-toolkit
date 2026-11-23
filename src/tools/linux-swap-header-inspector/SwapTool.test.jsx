import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SwapTool from './LinuxSwapHeaderInspectorTool.jsx';
import * as utils from './swap.utils.js';

vi.mock('./swap.utils.js', async (original) => ({
  ...await original(),
  readFirstPage: vi.fn(),
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function page(lastPage) {
  const bytes = new Uint8Array(4096);
  const view = new DataView(bytes.buffer);
  view.setUint32(1024, 1, true);
  view.setUint32(1028, lastPage, true);
  bytes.set(new TextEncoder().encode('SWAPSPACE2'), 4086);
  return bytes;
}

function select(name) {
  fireEvent.change(screen.getByLabelText('Choose swap file'), {
    target: { files: [new File(['x'], name)] },
  });
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('ignores older file reads that finish after a newer selection', async () => {
  const old = deferred();
  const next = deferred();
  utils.readFirstPage.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  render(<SwapTool />);
  select('old');
  select('new');
  await act(async () => { next.resolve(page(9)); await next.promise; });
  await act(async () => { old.resolve(page(2)); await old.promise; });
  expect(screen.getByText('Selected: new')).toBeInTheDocument();
  expect(screen.getByText('9')).toBeInTheDocument();
});

it('ignores a failed read after clear', async () => {
  const pending = deferred();
  utils.readFirstPage.mockReturnValueOnce(pending.promise);
  render(<SwapTool />);
  select('old');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await act(async () => { pending.reject(new Error('old error')); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Selected: old')).not.toBeInTheDocument();
});

it('displays an error instead of stale results for invalid pasted input', () => {
  render(<SwapTool />);
  const hex = Array.from(page(1), (byte) => byte.toString(16).padStart(2, '0')).join('');
  fireEvent.change(screen.getByLabelText('Or paste hexadecimal bytes'), {
    target: { value: hex },
  });
  expect(screen.getByText('SWAPSPACE2')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Or paste hexadecimal bytes'), {
    target: { value: '00' },
  });
  expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i);
  expect(screen.queryByText('SWAPSPACE2')).not.toBeInTheDocument();
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import XfsSuperblockInspectorTool from './XfsSuperblockInspectorTool.jsx';
import { createSample } from './xfs.utils.js';

const readers = [];
class FakeReader {
  readAsArrayBuffer(blob) { this.blob = blob; readers.push(this); }
  finish(bytes) { this.result = bytes.buffer; this.onload(); }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); readers.length = 0; });
function select(name) {
  fireEvent.change(screen.getByLabelText('XFS image file'), {
    target: { files: [new File([new Uint8Array(800)], name)] },
  });
}

it('loads samples, displays warnings, and copies the dump', async () => {
  const writeText = vi.fn().mockResolvedValue();
  Object.assign(navigator, { clipboard: { writeText } });
  render(<XfsSuperblockInspectorTool />);
  fireEvent.click(screen.getByText('Sample v5'));
  expect(screen.getByText('sb_features_ro_compat')).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByText('Copy')));
  expect(writeText).toHaveBeenCalledWith(screen.getByLabelText('Hex dump').value);
  fireEvent.change(screen.getByLabelText('Superblock hex'), { target: { value: 'zz' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/);
});

it('ignores out-of-order FileReader completions and reads slices', async () => {
  vi.stubGlobal('FileReader', FakeReader);
  render(<XfsSuperblockInspectorTool />);
  select('old'); select('new');
  expect(readers[0].blob.size).toBe(512);
  await act(async () => readers[1].finish(createSample(5)));
  await act(async () => readers[0].finish(createSample(4)));
  expect(screen.getByText('Superblock fields (version 5)')).toBeInTheDocument();
});

it('ignores completion after Clear or manual input', () => {
  vi.stubGlobal('FileReader', FakeReader);
  render(<XfsSuperblockInspectorTool />);
  select('old');
  fireEvent.click(screen.getByText('Clear'));
  act(() => readers[0].finish(createSample(4)));
  expect(screen.getByLabelText('Superblock hex')).toHaveValue('');
  select('old');
  fireEvent.change(screen.getByLabelText('Superblock hex'), { target: { value: 'aa' } });
  act(() => readers[1].finish(createSample(5)));
  expect(screen.getByLabelText('Superblock hex')).toHaveValue('aa');
});

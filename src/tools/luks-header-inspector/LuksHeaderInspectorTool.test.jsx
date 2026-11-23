import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LuksHeaderInspectorTool from './LuksHeaderInspectorTool.jsx';

function header(version) {
  const buffer = new ArrayBuffer(version === 1 ? 592 : 4096);
  new Uint8Array(buffer).set([0x4c, 0x55, 0x4b, 0x53, 0xba, 0xbe]);
  new DataView(buffer).setUint16(6, version);
  return buffer;
}

afterEach(cleanup);

it('ignores stale reads and bounds selection and drop reads', async () => {
  let resolveOld;
  const oldRead = new Promise((resolve) => { resolveOld = resolve; });
  const oldFile = { name: 'old', slice: vi.fn(() => ({ arrayBuffer: () => oldRead })) };
  const newFile = {
    name: 'new', slice: vi.fn(() => ({ arrayBuffer: () => Promise.resolve(header(2)) })),
  };
  render(<LuksHeaderInspectorTool />);
  fireEvent.change(screen.getByLabelText('Choose a file or drop it here'), {
    target: { files: [oldFile] },
  });
  await act(async () => {
    fireEvent.drop(screen.getByText('Choose a file or drop it here').parentElement, {
      dataTransfer: { files: [newFile] },
    });
  });
  expect(screen.getByText('LUKS2 header')).toBeInTheDocument();
  await act(async () => resolveOld(header(1)));
  expect(screen.getByText('LUKS2 header')).toBeInTheDocument();
  expect(screen.queryByText('LUKS1 header')).not.toBeInTheDocument();
  expect(oldFile.slice).toHaveBeenCalledWith(0, 4096);
  expect(newFile.slice).toHaveBeenCalledWith(0, 4096);
});

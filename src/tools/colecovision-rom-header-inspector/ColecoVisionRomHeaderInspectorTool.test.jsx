import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ColecoVisionRomHeaderInspectorTool from './ColecoVisionRomHeaderInspectorTool.jsx';

it('ignores stale reads and reports errors accessibly', async () => {
  let finishFirst;
  const first = new Promise((resolve) => { finishFirst = resolve; });
  const valid = new Uint8Array(36);
  valid.set([0x55, 0xaa]);
  const oldFile = { name: 'old.rom', size: 36,
    slice: vi.fn(() => ({ arrayBuffer: () => first })) };
  const newFile = { name: 'new.rom', size: 0,
    slice: vi.fn(() => ({ arrayBuffer: async () => new ArrayBuffer(0) })) };
  render(<ColecoVisionRomHeaderInspectorTool />);
  const input = screen.getByLabelText('ROM file');
  fireEvent.change(input, { target: { files: [oldFile] } });
  fireEvent.change(input, { target: { files: [newFile] } });
  await screen.findByRole('alert');
  finishFirst(valid.buffer);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Inspection failed'));
  expect(screen.getByRole('alert')).toHaveTextContent('too short');
  expect(oldFile.slice).toHaveBeenCalledWith(0, 32768);
});

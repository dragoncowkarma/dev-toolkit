import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import FatBootSectorInspectorTool from './FatBootSectorInspectorTool.jsx';

afterEach(cleanup);

it('discards an older read after a newer selection and after clearing', async () => {
  let resolveOld;
  let resolveNew;
  const old = { name: 'old.img', slice: () => ({ arrayBuffer: () => new Promise((resolve) => {
    resolveOld = resolve;
  }) }) };
  const newer = { name: 'new.img', slice: () => ({ arrayBuffer: () => new Promise((resolve) => {
    resolveNew = resolve;
  }) }) };
  render(<FatBootSectorInspectorTool />);
  const input = screen.getByLabelText('Choose a disk image');
  fireEvent.change(input, { target: { files: [old] } });
  fireEvent.change(input, { target: { files: [newer] } });
  await act(async () => resolveOld(new ArrayBuffer(10)));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('File: new.img')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await act(async () => resolveNew(new ArrayBuffer(10)));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('File: new.img')).not.toBeInTheDocument();
});

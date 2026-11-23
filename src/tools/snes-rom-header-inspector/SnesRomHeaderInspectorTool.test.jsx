import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import SnesRomHeaderInspectorTool from './SnesRomHeaderInspectorTool.jsx';

afterEach(cleanup);

it('ignores an older read after a new file is selected or cleared', async () => {
  let finishOld;
  const oldFile = { name: 'old.sfc', arrayBuffer: () => new Promise((resolve) => {
    finishOld = resolve;
  }) };
  const newFile = { name: 'new.sfc', arrayBuffer: async () => new ArrayBuffer(10) };
  render(<SnesRomHeaderInspectorTool />);
  const input = screen.getByLabelText('ROM file');
  fireEvent.change(input, { target: { files: [oldFile] } });
  fireEvent.change(input, { target: { files: [newFile] } });
  await screen.findByRole('alert');
  finishOld(new ArrayBuffer(0x8000));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('too small'));
  expect(screen.getByText('Selected: new.sfc')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

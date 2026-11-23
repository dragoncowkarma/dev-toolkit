import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import XarHeaderInspectorTool from './XarHeaderInspectorTool.jsx';

afterEach(cleanup);

it('reports missing input and renders a selected header', async () => {
  render(<XarHeaderInspectorTool />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Select a file');
  const buffer = new ArrayBuffer(28);
  const view = new DataView(buffer);
  view.setUint32(0, 0x78617221);
  view.setUint16(4, 28);
  view.setBigUint64(8, 9007199254740993n);
  const file = { size: 28, slice: () => ({ arrayBuffer: async () => buffer }) };
  fireEvent.change(screen.getByLabelText('XAR file'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
  expect(await screen.findByText('9007199254740993 bytes')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('TOC extends past end of fileYes');
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import GbaRomHeaderInspectorTool from './GbaRomHeaderInspectorTool.jsx';

afterEach(cleanup);

it('ignores an older file read when pasted input is inspected', async () => {
  let resolve;
  const buffer = new Promise((done) => { resolve = done; });
  const file = { name: 'old.gba', slice: () => ({ arrayBuffer: () => buffer }) };
  render(<GbaRomHeaderInspectorTool />);
  fireEvent.change(screen.getByLabelText(/Choose a ROM/), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('Paste header bytes'), { target: { value: '00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect bytes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('192 bytes');
  await act(async () => resolve(new ArrayBuffer(192)));
  expect(screen.getByRole('alert')).toHaveTextContent('192 bytes');
  expect(screen.queryByLabelText('Header summary')).not.toBeInTheDocument();
});

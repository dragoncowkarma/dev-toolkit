import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import FitsHeaderInspectorTool from './FitsHeaderInspectorTool.jsx';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fits(object) {
  const cards = ['SIMPLE  =                    T', 'BITPIX  =                    8',
    'NAXIS   =                    0', `OBJECT  = '${object}'`, 'END'];
  return new TextEncoder().encode(cards.map((card) => card.padEnd(80)).join('')
    .padEnd(2880)).buffer;
}
function select(input, file) {
  fireEvent.change(input, { target: { files: [file] } });
}
afterEach(cleanup);

it('ignores old reads after another selection or clear', async () => {
  render(<FitsHeaderInspectorTool />);
  const input = screen.getByLabelText('Choose a FITS file');
  const old = deferred();
  const current = deferred();
  select(input, { name: 'old.fits', arrayBuffer: () => old.promise });
  select(input, { name: 'new.fits', arrayBuffer: () => current.promise });
  await act(async () => current.resolve(fits('new')));
  await act(async () => old.resolve(fits('old')));
  expect(screen.getByText('new')).toBeInTheDocument();
  expect(screen.queryByText('old')).not.toBeInTheDocument();
  const pending = deferred();
  select(input, { name: 'pending.fits', arrayBuffer: () => pending.promise });
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await act(async () => pending.resolve(fits('pending')));
  expect(screen.queryByText('pending')).not.toBeInTheDocument();
});

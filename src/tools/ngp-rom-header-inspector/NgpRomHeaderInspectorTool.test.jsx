import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NgpRomHeaderInspectorTool from './NgpRomHeaderInspectorTool.jsx';

afterEach(cleanup);

it('reads only the first 64 bytes and displays the parsed header', async () => {
  const bytes = new Uint8Array(128);
  bytes.set(new TextEncoder().encode('COPYRIGHT BY SNK CORPORATION'));
  bytes.set(new TextEncoder().encode('TEST GAME'), 36);
  const file = new File([bytes], 'game.ngp');
  const slice = vi.spyOn(file, 'slice');
  render(<NgpRomHeaderInspectorTool />);
  fireEvent.change(screen.getByLabelText('ROM file'), { target: { files: [file] } });
  expect(await screen.findByText('TEST GAME')).toBeInTheDocument();
  expect(screen.getByText('Monochrome NGP')).toBeInTheDocument();
  expect(slice).toHaveBeenCalledWith(0, 64);
});

it('reports a truncated file', async () => {
  render(<NgpRomHeaderInspectorTool />);
  const file = new File([new Uint8Array(63)], 'short.ngp');
  fireEvent.change(screen.getByLabelText('ROM file'), { target: { files: [file] } });
  expect(await screen.findByRole('alert')).toHaveTextContent(/truncated/i);
});

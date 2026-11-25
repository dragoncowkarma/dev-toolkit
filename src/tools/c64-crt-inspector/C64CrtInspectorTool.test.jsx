import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import C64CrtInspectorTool from './C64CrtInspectorTool.jsx';
import { inspectCrt } from './crt.js';

vi.mock('./crt.js', () => ({ inspectCrt: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('clears the previous report immediately and ignores stale reads', async () => {
  let resolveOld;
  let resolveNew;
  inspectCrt.mockResolvedValueOnce({ header: { name: 'First', hardwareName: 'Normal',
    hardware: 0, version: 256, headerLength: 64, exrom: 0, game: 0 }, chips: [], warnings: [] })
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
  render(<C64CrtInspectorTool />);
  const input = screen.getByLabelText('Select CRT file');
  const choose = (name) => fireEvent.change(input, { target: { files: [new File([''], name)] } });
  await act(async () => choose('first.crt'));
  expect(screen.getByText('First')).toBeInTheDocument();
  choose('old.crt');
  expect(screen.queryByText('First')).not.toBeInTheDocument();
  choose('new.crt');
  await act(async () => resolveNew({ header: null, chips: [], warnings: ['New warning'] }));
  await act(async () => resolveOld({ header: null, chips: [], warnings: ['Old warning'] }));
  expect(screen.getByText('New warning')).toBeInTheDocument();
  expect(screen.queryByText('Old warning')).not.toBeInTheDocument();
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NesRomHeaderInspectorTool from './NesRomHeaderInspectorTool.jsx';

function validRom() {
  return new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function fileFromBytes(name, bytes) {
  return { name, arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer) };
}

afterEach(cleanup);

describe('NesRomHeaderInspectorTool', () => {
  it('renders the upload controls', () => {
    render(<NesRomHeaderInspectorTool />);

    expect(screen.getByText(/Drop a .nes ROM here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load sample' })).toBeInTheDocument();
  });

  it('loads and renders the built-in sample', () => {
    render(<NesRomHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));

    expect(screen.getByText('minimal-sample.nes')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('iNES 1.0')).toBeInTheDocument();
  });

  it('inspects an uploaded ROM file', async () => {
    render(<NesRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Choose NES ROM file');
    const file = fileFromBytes('game.nes', validRom());

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('game.nes')).toBeInTheDocument();
  });

  it('inspects a ROM dropped onto the dropzone', async () => {
    render(<NesRomHeaderInspectorTool />);
    const dropzone = screen.getByText(/Drop a .nes ROM here/i).parentElement;
    const file = fileFromBytes('dropped.nes', validRom());

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(await screen.findByText('dropped.nes')).toBeInTheDocument();
  });

  it('shows an accessible parse error', async () => {
    render(<NesRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Choose NES ROM file');
    const invalidFile = fileFromBytes('bad.nes', new Uint8Array(16));

    fireEvent.change(input, { target: { files: [invalidFile] } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/magic signature/));
  });
});

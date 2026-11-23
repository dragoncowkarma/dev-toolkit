import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NdsRomHeaderInspectorTool from './NdsRomHeaderInspectorTool.jsx';
import {
  bytesToHexString,
  createSyntheticHeader,
} from './ndsRomHeaderInspector.utils.js';

describe('NdsRomHeaderInspectorTool UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders initial empty state with semantic landmarks and controls', () => {
    render(<NdsRomHeaderInspectorTool />);

    expect(
      screen.getByRole('region', { name: 'Nintendo DS ROM Header Inspector' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File Upload' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Upload Nintendo DS ROM File Dropzone/)
    ).toBeInTheDocument();
  });

  it('loads and displays a sample valid NDS header', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const loadBtn = screen.getByRole('button', { name: 'Load Sample' });
    fireEvent.click(loadBtn);

    expect(await screen.findByText('Cartridge Information')).toBeInTheDocument();
    expect(screen.getByText('MARIO KART')).toBeInTheDocument();
    expect(screen.getByText('AMKE')).toBeInTheDocument();
    expect(screen.getByText(/Nintendo \(01\)/)).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'ARM Processors Memory and Binary Layout' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Checksum Verifications' })
    ).toBeInTheDocument();
  });

  it('switches to paste mode and displays error on truncated input with role="alert"', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const pasteModeBtn = screen.getByRole('button', { name: 'Paste Hex / Base64' });
    fireEvent.click(pasteModeBtn);

    expect(pasteModeBtn).toHaveAttribute('aria-pressed', 'true');
    const textarea = screen.getByLabelText(/Paste ROM Header Bytes/);

    // Enter truncated hex
    fireEvent.change(textarea, { target: { value: '4D 41 52 49 4F' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Truncated ROM header/);
  });

  it('parses valid pasted hex bytes and displays header summary', async () => {
    const sample = createSyntheticHeader({ gameTitle: 'ZELDA PH' });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    const pasteModeBtn = screen.getByRole('button', { name: 'Paste Hex / Base64' });
    fireEvent.click(pasteModeBtn);

    const textarea = screen.getByLabelText(/Paste ROM Header Bytes/);
    fireEvent.change(textarea, { target: { value: hex } });

    expect(await screen.findByText('ZELDA PH')).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
  });

  it('clears data when Clear button is clicked', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const loadBtn = screen.getByRole('button', { name: 'Load Sample' });
    fireEvent.click(loadBtn);

    expect(await screen.findByText('MARIO KART')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    expect(screen.queryByText('MARIO KART')).not.toBeInTheDocument();
    expect(screen.queryByText('Cartridge Information')).not.toBeInTheDocument();
  });

  it('handles file upload selection', async () => {
    const sample = createSyntheticHeader({ gameTitle: 'METROID' });
    const file = new File([sample], 'metroid.nds', { type: 'application/octet-stream' });

    render(<NdsRomHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Select NDS ROM file');
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('METROID')).toBeInTheDocument();
    expect(screen.getByText('metroid.nds')).toBeInTheDocument();
  });

  it('copies summary to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(await screen.findByText('MARIO KART')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    expect(writeTextMock.mock.calls[0][0]).toContain('Nintendo DS ROM Header Summary');
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });
});

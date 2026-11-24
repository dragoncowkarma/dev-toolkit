import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmsRomHeaderInspectorTool from './SmsRomHeaderInspectorTool.jsx';
import * as utils from './smsRomHeaderInspector.utils.js';
import { createMockSmsRom } from './smsRomHeaderInspector.utils.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SmsRomHeaderInspectorTool UI & Interactions', () => {
  it('renders initial view with title, dropzone, and sample buttons', () => {
    render(<SmsRomHeaderInspectorTool />);

    expect(
      screen.getByRole('heading', { name: 'Sega Master System ROM Header Inspector' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Upload Sega Master System or Game Gear ROM')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Summary' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '32 KB SMS (Valid)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '8 KB SMS (0x1FF0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '16 KB GG (0x3FF0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bad Checksum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Malformed ROM' })).toBeInTheDocument();
  });

  it('inspects a valid 32 KB SMS ROM file and displays parsed header fields', async () => {
    render(<SmsRomHeaderInspectorTool />);

    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
      regionCode: 0x4,
      productCode: 53412,
      version: 0,
    });
    const file = new File([rom], 'sonic.sms', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload Sega Master System or Game Gear ROM');

    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByText('Loaded: sonic.sms')).toBeInTheDocument();
      expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    });

    expect(screen.getByText('0x7FF0')).toBeInTheDocument();
    expect(screen.getAllByText('TMR SEGA')[0]).toBeInTheDocument();
    expect(screen.getByText('53412')).toBeInTheDocument();
    expect(screen.getByText('SMS Export')).toBeInTheDocument();
    expect(screen.getByText('32 KB')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Diagnostics' })).not.toBeInTheDocument();
  });

  it('loads sample 8 KB ROM at 0x1FF0 and inspects it', async () => {
    render(<SmsRomHeaderInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: '8 KB SMS (0x1FF0)' });
    await act(async () => fireEvent.click(sampleBtn));

    await waitFor(() => {
      expect(screen.getByText('Loaded: sms_8kb_sample.sms')).toBeInTheDocument();
      expect(screen.getByText('0x1FF0')).toBeInTheDocument();
      expect(screen.getByText('SMS Japan')).toBeInTheDocument();
      expect(screen.getByText('8 KB')).toBeInTheDocument();
    });
  });

  it('loads sample 16 KB Game Gear ROM at 0x3FF0 and inspects it', async () => {
    render(<SmsRomHeaderInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: '16 KB GG (0x3FF0)' });
    await act(async () => fireEvent.click(sampleBtn));

    await waitFor(() => {
      expect(screen.getByText('Loaded: gamegear_sample.gg')).toBeInTheDocument();
      expect(screen.getByText('0x3FF0')).toBeInTheDocument();
      expect(screen.getByText('GG Japan')).toBeInTheDocument();
      expect(screen.getByText('16 KB')).toBeInTheDocument();
    });
  });

  it('displays checksum mismatch diagnostic when bad checksum sample is loaded', async () => {
    render(<SmsRomHeaderInspectorTool />);

    const badChecksumBtn = screen.getByRole('button', { name: 'Bad Checksum' });
    await act(async () => fireEvent.click(badChecksumBtn));

    await waitFor(() => {
      expect(screen.getByText('⚠ Header Issues')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Diagnostics' })).toBeInTheDocument();
      expect(screen.getByText(/Checksum mismatch/)).toBeInTheDocument();
    });
  });

  it('handles malformed ROM with missing header without error', async () => {
    render(<SmsRomHeaderInspectorTool />);

    const malformedBtn = screen.getByRole('button', { name: 'Malformed ROM' });
    await act(async () => fireEvent.click(malformedBtn));

    await waitFor(() => {
      expect(screen.getByText('✕ Missing Header')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Diagnostics' })).toBeInTheDocument();
      expect(
        screen.getByText(/Missing 'TMR SEGA' signature at offsets/)
      ).toBeInTheDocument();
    });
  });

  it('copies summary to clipboard and announces copied status via polite live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SmsRomHeaderInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: '32 KB SMS (Valid)' });
    await act(async () => fireEvent.click(sampleBtn));

    await waitFor(() => expect(screen.getByText('✓ Valid Header')).toBeInTheDocument());

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    expect(copyBtn).toBeEnabled();

    await act(async () => fireEvent.click(copyBtn));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain('Sega Master System / Game Gear ROM Header');
    expect(copiedText).toContain('Signature: TMR SEGA');
    expect(copiedText).toContain('Status: Valid');

    const liveStatus = screen.getByRole('status');
    expect(liveStatus).toHaveAttribute('aria-live', 'polite');
    expect(liveStatus).toHaveTextContent('Copied to clipboard');
  });

  it('copies summary on a malformed ROM without error', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SmsRomHeaderInspectorTool />);

    const malformedBtn = screen.getByRole('button', { name: 'Malformed ROM' });
    await act(async () => fireEvent.click(malformedBtn));

    await waitFor(() => expect(screen.getByText('✕ Missing Header')).toBeInTheDocument());

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    await act(async () => fireEvent.click(copyBtn));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain('Header: Not found');
    expect(copiedText).toContain('Status: Invalid ROM');
    expect(copiedText).toContain("Missing 'TMR SEGA' signature");
  });

  it('clears inspection state and resets UI when Clear is clicked', async () => {
    render(<SmsRomHeaderInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: '32 KB SMS (Valid)' });
    await act(async () => fireEvent.click(sampleBtn));

    await waitFor(() => expect(screen.getByText('✓ Valid Header')).toBeInTheDocument());

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    await act(async () => fireEvent.click(clearBtn));

    expect(screen.queryByText('✓ Valid Header')).not.toBeInTheDocument();
    expect(screen.getByText('Choose a ROM file or drag & drop here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Summary' })).toBeDisabled();
  });

  it('resets loading state when clearing an in-flight read', async () => {
    let resolveInspection;
    const deferredPromise = new Promise((resolve) => {
      resolveInspection = resolve;
    });
    vi.spyOn(utils, 'inspectSmsRom').mockImplementation(() => deferredPromise);

    render(<SmsRomHeaderInspectorTool />);
    const file = new File([new Uint8Array(1024)], 'test.sms', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Upload Sega Master System or Game Gear ROM');

    await act(async () => selectFile(fileInput, file));

    expect(screen.getByText('Reading ROM header...')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect(clearBtn).toBeEnabled();

    await act(async () => fireEvent.click(clearBtn));

    expect(screen.queryByText('Reading ROM header...')).not.toBeInTheDocument();
    expect(screen.getByText('Choose a ROM file or drag & drop here')).toBeInTheDocument();

    await act(async () => resolveInspection({ valid: false }));
    expect(screen.queryByText('Reading ROM header...')).not.toBeInTheDocument();
  });
});

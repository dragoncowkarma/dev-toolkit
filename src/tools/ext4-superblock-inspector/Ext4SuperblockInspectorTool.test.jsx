import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Ext4SuperblockInspectorTool from './Ext4SuperblockInspectorTool.jsx';
import { createSampleSuperblock } from './ext4.utils.js';

describe('Ext4SuperblockInspectorTool component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the inspector heading, inputs, and sample buttons', () => {
    render(<Ext4SuperblockInspectorTool />);

    expect(
      screen.getByRole('heading', { level: 2, name: /ext4 Superblock Inspector/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Drop or select disk image file/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load Sample ext4/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sample ext3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sample ext2/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/paste disk image hex bytes/i)).toBeInTheDocument();
  });

  it('loads ext4 sample data and renders filesystem geometry and feature chips', () => {
    render(<Ext4SuperblockInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: /Load Sample ext4/i });
    fireEvent.click(sampleBtn);

    expect(screen.getByTestId('ext4-results')).toBeInTheDocument();
    expect(screen.getByText('ext4')).toBeInTheDocument();
    expect(screen.getByText('0xEF53')).toBeInTheDocument();
    expect(screen.getByText('rootfs-ext4')).toBeInTheDocument();
    expect(screen.getByText('4,096 bytes')).toBeInTheDocument();
    expect(screen.getByText('deadbeef-cafe-4000-8000-123456789abc')).toBeInTheDocument();

    // Feature chips
    expect(screen.getByText('has_journal')).toBeInTheDocument();
    expect(screen.getByText('extents')).toBeInTheDocument();
    expect(screen.getByText('64bit')).toBeInTheDocument();
    expect(screen.getByText('flex_bg')).toBeInTheDocument();
    expect(screen.getByText('sparse_super')).toBeInTheDocument();
  });

  it('loads ext2 sample and updates variant and features', () => {
    render(<Ext4SuperblockInspectorTool />);

    const sampleExt2Btn = screen.getByRole('button', { name: /Sample ext2/i });
    fireEvent.click(sampleExt2Btn);

    expect(screen.getByText('ext2')).toBeInTheDocument();
    expect(screen.getByText('boot-ext2')).toBeInTheDocument();
  });

  it('displays role="alert" when invalid hex is entered', () => {
    render(<Ext4SuperblockInspectorTool />);

    const textarea = screen.getByLabelText(/paste disk image hex bytes/i);
    fireEvent.change(textarea, { target: { value: '12345' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/even number/i);
  });

  it('clears all parsed results and inputs on Clear button click', () => {
    render(<Ext4SuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample ext4/i }));
    expect(screen.getByTestId('ext4-results')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByTestId('ext4-results')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/paste disk image hex bytes/i)).toHaveValue('');
  });

  it('handles disk image file drop and slice parsing', async () => {
    render(<Ext4SuperblockInspectorTool />);

    const sampleBytes = createSampleSuperblock('ext4');
    const file = new File([sampleBytes], 'test-disk.img', { type: 'application/octet-stream' });

    const dropzone = screen.getByRole('button', { name: /Drop or select disk image file/i });
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('ext4-results')).toBeInTheDocument();
      expect(screen.getByText('ext4')).toBeInTheDocument();
    });
  });

  it('copies the hex dump to clipboard when Copy Hex Dump is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<Ext4SuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: /Load Sample ext4/i }));

    const copyBtn = screen.getByRole('button', { name: /Copy Hex Dump/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0][0]).toContain('00000400');
  });
});

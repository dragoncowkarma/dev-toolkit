import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HfsVolumeHeaderInspectorTool from './HfsVolumeHeaderInspectorTool.jsx';
import {
  bytesToHex,
  createSampleHfsHeader,
  HFS_PLUS_SIGNATURE,
} from './hfs-volume-header-inspector.utils.js';

afterEach(() => {
  cleanup();
});

describe('HfsVolumeHeaderInspectorTool component', () => {
  it('renders input area and toolbar buttons', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    expect(screen.getByRole('region', {
      name: 'HFS+ Volume Header Inspector',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hex Input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample HFS+' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample HFSX' })).toBeInTheDocument();
  });

  it('loads sample HFS+ volume header on button click', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample HFS+' }));

    expect(screen.getByText('Volume Header Details')).toBeInTheDocument();
    expect(screen.getByText(/HFS\+ \(H\+\)/)).toBeInTheDocument();
    expect(screen.getByText('4,096 B')).toBeInTheDocument();
    expect(screen.getByText('1.00 GB')).toBeInTheDocument();
  });

  it('loads sample HFSX volume header on button click', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample HFSX' }));

    expect(screen.getByText(/HFSX \(HX\)/)).toBeInTheDocument();
  });

  it('displays diagnostics on corrupt volume header sample', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Corrupt' }));

    expect(screen.getByText('Diagnostics & Integrity Checks')).toBeInTheDocument();
    expect(screen.getByText(/Bad signature/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid block size/)).toBeInTheDocument();
    expect(screen.getByText(/freeBlocks \(500000\) cannot exceed totalBlocks/)).toBeInTheDocument();
  });

  it('displays error on invalid hex input', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Paste HFS\+ \/ HFSX Volume Hex/);
    fireEvent.change(textarea, { target: { value: 'invalid_hex!' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Hex string contains invalid characters/);
  });

  it('switches between special file forks', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    const sample = createSampleHfsHeader({ signature: HFS_PLUS_SIGNATURE });
    const hex = bytesToHex(sample);

    const textarea = screen.getByLabelText(/Paste HFS\+ \/ HFSX Volume Hex/);
    fireEvent.change(textarea, { target: { value: hex } });

    expect(screen.getByText('Allocation File')).toBeInTheDocument();
    const catalogTab = screen.getByRole('tab', { name: 'Catalog File' });
    fireEvent.click(catalogTab);

    expect(catalogTab).toHaveClass('active');
    expect(screen.getByText('10.00 MB')).toBeInTheDocument();
  });

  it('clears input and output on Clear button click', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample HFS+' }));
    expect(screen.getByText('Volume Header Details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Volume Header Details')).not.toBeInTheDocument();
  });

  it('switches to file upload mode', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    expect(
      screen.getByText('Choose an HFS+ disk image or volume header file')
    ).toBeInTheDocument();
  });
});

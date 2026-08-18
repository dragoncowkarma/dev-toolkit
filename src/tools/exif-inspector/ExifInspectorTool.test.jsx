import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExifInspectorTool from './ExifInspectorTool.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ExifInspectorTool', () => {
  it('renders IFD groups and the Auto resolved format for a valid sample', () => {
    render(<ExifInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.getByText('Resolved format:')).toHaveTextContent('hex');
    expect(screen.getByRole('heading', { name: 'IFD0' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Exif SubIFD' })).toBeInTheDocument();
    expect(screen.getByText('DateTimeOriginal')).toBeInTheDocument();
  });

  it('shows format selection, base64 resolution, and an inline parse error', () => {
    render(<ExifInspectorTool />);
    fireEvent.change(screen.getByLabelText('Input format'), { target: { value: 'base64' } });
    fireEvent.change(screen.getByLabelText('JPEG or TIFF payload'), { target: { value: '%%%%' } });
    expect(screen.getByText('Resolved format:')).toHaveTextContent('base64');
    expect(screen.getByRole('alert')).toHaveTextContent(/Malformed base64/);
  });

  it('reports both successful and failed copy actions', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ExifInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Make' })); });
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy all' })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy');
  });
});

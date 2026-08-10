import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EnvFileTool from './EnvFileTool.jsx';

afterEach(() => vi.restoreAllMocks());

function enterSource(value = 'TOKEN=sk_live_abc123\nNAME=Ada') {
  fireEvent.change(screen.getByLabelText('.env source'), { target: { value } });
}

describe('EnvFileTool', () => {
  it('renders a neutral empty state and displays parsed entries on input', () => {
    render(<EnvFileTool />);
    expect(screen.getByText('Paste a .env file to inspect its entries.')).toBeInTheDocument();

    enterSource('FIRST=one\nFIRST=two');
    expect(screen.getAllByText('FIRST')).toHaveLength(2);
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
  });

  it('starts with secret masking disabled and toggles masked values', () => {
    render(<EnvFileTool />);
    enterSource();
    expect(screen.getByText('sk_live_abc123')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Mask displayed values'));
    expect(screen.getByText('••••••••••c123')).toBeInTheDocument();
  });

  it('switches output formats and reports accessible parsing errors', () => {
    render(<EnvFileTool />);
    enterSource('A=1\nBROKEN');
    expect(screen.getByRole('alert')).toHaveTextContent('Line 2');

    fireEvent.change(screen.getByLabelText('Output format'), { target: { value: 'shell' } });
    expect(screen.getByLabelText('Converted output')).toHaveValue('export A="1"');
  });

  it('copies output and exposes comparison differences', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<EnvFileTool />);
    enterSource('A=1\nB=2');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    });
    expect(writeText).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Copied output to clipboard.');

    fireEvent.click(screen.getByRole('button', { name: 'Compare .env.example' }));
    fireEvent.change(screen.getByLabelText('.env.example'), { target: { value: 'B=\nC=' } });
    expect(screen.getByText('Missing in .env')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('Missing in .env.example')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});

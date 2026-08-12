import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HexInspectorTool from './HexInspectorTool.jsx';
import { SAMPLE_HEX, SAMPLE_TEXT } from './hexInspector.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HexInspectorTool Text to Hex mode', () => {
  it('converts typed text into uppercase hex bytes in real time', () => {
    render(<HexInspectorTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hi' } });

    expect(screen.getByLabelText('Hex bytes')).toHaveValue('48 69');
  });

  it('renders a byte-inspection table for valid input', () => {
    render(<HexInspectorTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'A' } });

    expect(screen.getByRole('columnheader', { name: 'Offset' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '0x41' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '65' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '01000001' })).toBeInTheDocument();
  });

  it('clears the result and table when the input is emptied', () => {
    render(<HexInspectorTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '' } });

    expect(screen.getByLabelText('Hex bytes')).toHaveValue('');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('HexInspectorTool Hex to Text mode', () => {
  function switchToHexToText() {
    fireEvent.click(screen.getByRole('button', { name: 'Hex to Text' }));
  }

  it('decodes valid hex bytes back into text', () => {
    render(<HexInspectorTool />);
    switchToHexToText();

    fireEvent.change(screen.getByLabelText('Hex bytes'), { target: { value: '48 69' } });

    expect(screen.getByLabelText('Text')).toHaveValue('Hi');
  });

  it('accepts spaces, tabs, and newlines between bytes', () => {
    render(<HexInspectorTool />);
    switchToHexToText();

    fireEvent.change(screen.getByLabelText('Hex bytes'), {
      target: { value: '48\t69\n21' },
    });

    expect(screen.getByLabelText('Text')).toHaveValue('Hi!');
  });

  it('reports an odd digit count as an alert without throwing', () => {
    render(<HexInspectorTool />);
    switchToHexToText();

    fireEvent.change(screen.getByLabelText('Hex bytes'), { target: { value: 'ABC' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/odd number of digits/);
    expect(screen.getByLabelText('Text')).toHaveValue('');
  });

  it('reports an invalid character as an alert without throwing', () => {
    render(<HexInspectorTool />);
    switchToHexToText();

    fireEvent.change(screen.getByLabelText('Hex bytes'), { target: { value: 'ZZ' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid character/);
  });

  it('reports invalid UTF-8 as a controlled alert, never a decoded result', () => {
    render(<HexInspectorTool />);
    switchToHexToText();

    // A lone leading byte of a 3-byte UTF-8 sequence: truncated/malformed.
    fireEvent.change(screen.getByLabelText('Hex bytes'), { target: { value: 'EC' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/not valid UTF-8/);
    expect(screen.getByLabelText('Text')).toHaveValue('');
  });

  it('still renders the byte table when parsing succeeds but UTF-8 decoding fails', () => {
    render(<HexInspectorTool />);
    switchToHexToText();

    fireEvent.change(screen.getByLabelText('Hex bytes'), { target: { value: 'EC' } });

    expect(screen.getByRole('cell', { name: '0xEC' })).toBeInTheDocument();
  });
});

describe('HexInspectorTool mode switching', () => {
  it('clears input, output, and errors when switching modes', () => {
    render(<HexInspectorTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hex to Text' }));

    expect(screen.getByLabelText('Hex bytes')).toHaveValue('');
    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('HexInspectorTool sample and clear actions', () => {
  it('loads a sample string in Text to Hex mode', () => {
    render(<HexInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByLabelText('Text')).toHaveValue(SAMPLE_TEXT);
  });

  it('loads a sample hex byte stream in Hex to Text mode', () => {
    render(<HexInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex to Text' }));

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByLabelText('Hex bytes')).toHaveValue(SAMPLE_HEX);
  });

  it('clears input, output, and the byte table', () => {
    render(<HexInspectorTool />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Hex bytes')).toHaveValue('');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('HexInspectorTool copy behavior', () => {
  it('announces a successful copy in a status live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HexInspectorTool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hi' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('48 69');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports a denied copy in an accessible alert', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HexInspectorTool />);
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hi' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });

  it('disables Copy when there is no result to copy', () => {
    render(<HexInspectorTool />);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});

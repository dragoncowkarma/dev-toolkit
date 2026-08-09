import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import XmlTool from './XmlTool.jsx';

const VALID_XML_UNFORMATTED = '<root><child attr="val">text</child></root>';
const INVALID_XML = '<root><child>unclosed';

function getInput() {
  return screen.getByLabelText('XML Input Area');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('XmlTool Format & Minify', () => {
  it('formats valid XML input into indented output', async () => {
    render(<XmlTool />);

    fireEvent.change(getInput(), { target: { value: VALID_XML_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Format XML' }));

    await waitFor(() => {
      expect(getInput().value).toContain('\n  <child');
    });
  });

  it('compresses formatted XML into a single minified line', async () => {
    render(<XmlTool />);

    fireEvent.change(getInput(), { target: { value: VALID_XML_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Minify XML' }));

    await waitFor(() => {
      expect(getInput().value).toBe('<root><child attr="val">text</child></root>');
    });
  });
});

describe('XmlTool Clear & Sample Load', () => {
  it('resets input and output when clear button is clicked', async () => {
    render(<XmlTool />);

    fireEvent.change(getInput(), { target: { value: VALID_XML_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear inputs' }));

    expect(getInput()).toHaveValue('');
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('loads sample XML when load sample button is clicked', async () => {
    render(<XmlTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample XML' }));

    await waitFor(() => {
      expect(getInput().value).toContain('soap:Envelope');
    });
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });
});

describe('XmlTool Copy & Download', () => {
  it('copies output to clipboard and shows toast and ARIA message', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<XmlTool />);

    fireEvent.change(getInput(), { target: { value: VALID_XML_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('Copied to clipboard!');
  });

  it('triggers a file download for current output', async () => {
    render(<XmlTool />);

    fireEvent.change(getInput(), { target: { value: VALID_XML_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: 'Download output as file' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('XmlTool Validation & Error state', () => {
  it('displays error details with line and column for invalid XML', async () => {
    render(<XmlTool />);

    fireEvent.change(getInput(), { target: { value: INVALID_XML } });

    await waitFor(() => expect(screen.getByText('Invalid')).toBeInTheDocument());
    const errorAlert = screen.getByRole('alert');
    expect(within(errorAlert).getByText(/XML Validation Error/)).toBeInTheDocument();
    expect(within(errorAlert).getByText(/Unclosed tag '<child>'/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Format XML' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Minify XML' })).toBeDisabled();
  });
});

describe('XmlTool Back Button', () => {
  it('invokes onBack callback when clicked', () => {
    const onBack = vi.fn();
    render(<XmlTool onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go back to tool dashboard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

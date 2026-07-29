import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonTool from './JsonTool.jsx';

const VALID_JSON_UNFORMATTED = '{"foo":"bar","num":1,"arr":[1,2],"nested":{"x":true}}';
const INVALID_JSON = '{"foo": "bar",}';

function getInput() {
  return screen.getByLabelText('JSON Input Area');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JsonTool Format', () => {
  it('formats valid JSON input into indented output', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Format JSON' }));

    await waitFor(() => {
      expect(getInput()).toHaveValue(JSON.stringify(JSON.parse(VALID_JSON_UNFORMATTED), null, 2));
    });
  });
});

describe('JsonTool Minify', () => {
  it('compresses formatted JSON into a single line', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Format JSON' }));
    await waitFor(() => {
      expect(getInput().value).toContain('\n');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Minify JSON' }));

    await waitFor(() => {
      expect(getInput()).toHaveValue(JSON.stringify(JSON.parse(VALID_JSON_UNFORMATTED)));
    });
    expect(getInput().value).not.toContain('\n');
  });
});

describe('JsonTool Clear', () => {
  it('resets the input and output areas', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear inputs' }));

    expect(getInput()).toHaveValue('');
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });
});

describe('JsonTool Sample Load', () => {
  it('loads and displays the sample JSON', async () => {
    render(<JsonTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample JSON' }));

    await waitFor(() => {
      expect(getInput().value).toContain('JSON Formatter');
    });
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });
});

describe('JsonTool Tree View', () => {
  it('switches to tree view and renders parsed nodes', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    const treeTab = screen.getByRole('tab', { name: 'Tree View' });
    await waitFor(() => expect(treeTab).not.toBeDisabled());
    fireEvent.click(treeTab);

    expect(treeTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByText('"foo":', { exact: false, selector: '.json-tree-key' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('"bar"', { exact: false, selector: '.json-tree-string' })
    ).toBeInTheDocument();
  });
});

describe('JsonTool Download', () => {
  it('triggers a file download for the current output', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
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

describe('JsonTool Copy', () => {
  it('copies the output to the clipboard and shows a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('Copied to clipboard!');
  });
});

describe('JsonTool error state', () => {
  it('shows a parse error message for invalid JSON', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: INVALID_JSON } });

    await waitFor(() => expect(screen.getByText('Invalid')).toBeInTheDocument());
    const errorAlert = screen.getByRole('alert');
    expect(within(errorAlert).getByText(/JSON Parse Error/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Minify JSON' })).toBeDisabled();
  });
});

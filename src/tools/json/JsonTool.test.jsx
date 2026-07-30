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

describe('JsonTool Large Data & Virtualization Regression', () => {
  it('limits DOM nodes for line numbers and tree rows to under 100 for large JSON (10,000+ lines)', async () => {
    render(<JsonTool />);

    const largeJson = '[\n' + Array.from({ length: 10000 }, (_, i) => i).join(',\n') + '\n]';

    fireEvent.change(getInput(), { target: { value: largeJson } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    const lineItems = document.querySelectorAll('.line-number-item');
    expect(lineItems.length).toBeGreaterThan(0);
    expect(lineItems.length).toBeLessThan(100);

    const treeTab = screen.getByRole('tab', { name: 'Tree View' });
    await waitFor(() => expect(treeTab).not.toBeDisabled());
    fireEvent.click(treeTab);

    const treeRows = document.querySelectorAll('.json-tree-row');
    expect(treeRows.length).toBeGreaterThan(0);
    expect(treeRows.length).toBeLessThan(100);
  });

  it('maintains tree container DOM identity (no unmount/remount) across Collapse All and Expand All', async () => {
    render(<JsonTool />);

    fireEvent.change(getInput(), { target: { value: VALID_JSON_UNFORMATTED } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    const treeTab = screen.getByRole('tab', { name: 'Tree View' });
    await waitFor(() => expect(treeTab).not.toBeDisabled());
    fireEvent.click(treeTab);

    const treeContainerBefore = screen.getByRole('tree');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all nodes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand all nodes' }));

    const treeContainerAfter = screen.getByRole('tree');
    expect(treeContainerAfter).toBe(treeContainerBefore);
  });

  it('preserves child collapsed state after collapsing and re-expanding parent node', async () => {
    render(<JsonTool />);

    const nestedJson = JSON.stringify({
      outer: {
        inner: {
          a: 1,
        },
      },
    });

    fireEvent.change(getInput(), { target: { value: nestedJson } });
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());

    const treeTab = screen.getByRole('tab', { name: 'Tree View' });
    await waitFor(() => expect(treeTab).not.toBeDisabled());
    fireEvent.click(treeTab);

    const collapseInnerBtn = screen.getByRole('button', { name: 'Collapse inner node' });
    const collapseOuterBtn = screen.getByRole('button', { name: 'Collapse outer node' });

    fireEvent.click(collapseInnerBtn);
    expect(screen.getByRole('button', { name: 'Expand inner node' })).toBeInTheDocument();

    fireEvent.click(collapseOuterBtn);

    const expandOuterBtn = screen.getByRole('button', { name: 'Expand outer node' });
    fireEvent.click(expandOuterBtn);

    expect(screen.getByRole('button', { name: 'Expand inner node' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse inner node' })).toBeNull();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import YamlTool from './YamlTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('YamlTool conversion', () => {
  it('converts YAML input to JSON in real time', async () => {
    render(<YamlTool />);

    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'name: Ada\nactive: true' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('JSON output')).toHaveValue(
        '{\n  "name": "Ada",\n  "active": true\n}',
      );
    });
  });

  it('switches to JSON-to-YAML mode and applies the selected indentation', async () => {
    render(<YamlTool />);

    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'name: Ada' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('JSON output')).toHaveValue('{\n  "name": "Ada"\n}');
    });
    fireEvent.click(screen.getByRole('button', { name: 'JSON to YAML' }));
    expect(screen.getByRole('button', { name: 'JSON to YAML' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('JSON input')).toHaveValue('{\n  "name": "Ada"\n}');
    fireEvent.change(screen.getByLabelText('JSON input'), {
      target: { value: '{"settings":{"enabled":true,"items":["one"]}}' },
    });
    fireEvent.change(screen.getByLabelText('YAML indentation'), {
      target: { value: '4' },
    });

    await waitFor(() => {
      const output = screen.getByLabelText('YAML output');
      expect(output.value).toContain('    enabled: true');
      expect(output.value).toContain('        - one');
    });
  });

  it('formats valid YAML input with the selected indentation', async () => {
    render(<YamlTool />);

    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'settings:\n enabled: true' },
    });
    fireEvent.change(screen.getByLabelText('YAML indentation'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format YAML' }));

    await waitFor(() => {
      expect(screen.getByLabelText('YAML input').value).toContain('    enabled: true');
    });
  });
});

describe('YamlTool errors', () => {
  it('shows a YAML error bar with a line number', async () => {
    render(<YamlTool />);

    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'name: Ada\nname: Lin' },
    });

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('YAML input is invalid.');
    expect(error).toHaveTextContent('Line 2, column 1');
  });

  it('shows a JSON error bar after changing mode', async () => {
    render(<YamlTool />);

    fireEvent.click(screen.getByRole('button', { name: 'JSON to YAML' }));
    fireEvent.change(screen.getByLabelText('JSON input'), {
      target: { value: '{\n  "name": "Ada"\n  "active": true\n}' },
    });

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('JSON input is invalid.');
    expect(error).toHaveTextContent('Line 3, column 3');
  });

  it('distinguishes unrepresentable YAML from malformed YAML', async () => {
    render(<YamlTool />);

    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'value: .nan' },
    });

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Cannot convert this YAML input without data loss.');
    expect(error).toHaveTextContent('Non-finite numbers');
  });
});

describe('YamlTool output actions', () => {
  it('copies the converted output to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<YamlTool />);

    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'name: Ada' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy converted output' }));
    });

    expect(writeText).toHaveBeenCalledWith('{\n  "name": "Ada"\n}');
    expect(await screen.findByRole('status')).toHaveTextContent('Copied output to clipboard.');
  });

  it('downloads the JSON result with the appropriate type and extension', () => {
    const createObjectURL = vi.fn(() => 'blob:yaml-converter');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    let clickedAnchor;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureAnchor() {
        clickedAnchor = this;
      });

    render(<YamlTool />);
    fireEvent.change(screen.getByLabelText('YAML input'), {
      target: { value: 'name: Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download converted output' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0].type).toBe('application/json');
    expect(clickedAnchor.download).toBe('converted.json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:yaml-converter');
    clickSpy.mockRestore();
  });

  it('downloads the YAML result with the appropriate type and extension', () => {
    const createObjectURL = vi.fn(() => 'blob:yaml-converter');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    let clickedAnchor;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureAnchor() {
        clickedAnchor = this;
      });

    render(<YamlTool />);
    fireEvent.click(screen.getByRole('button', { name: 'JSON to YAML' }));
    fireEvent.change(screen.getByLabelText('JSON input'), {
      target: { value: '{"name":"Ada"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download converted output' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0].type).toBe('text/yaml');
    expect(clickedAnchor.download).toBe('converted.yaml');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:yaml-converter');
    clickSpy.mockRestore();
  });
});

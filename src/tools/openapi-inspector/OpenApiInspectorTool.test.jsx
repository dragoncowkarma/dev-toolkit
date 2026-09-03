import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenApiInspectorTool from './OpenApiInspectorTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OpenApiInspectorTool rendering and inspection', () => {
  it('renders default sample spec and summary', () => {
    render(<OpenApiInspectorTool />);

    expect(screen.getByText('OpenAPI Spec Inspector')).toBeInTheDocument();
    expect(screen.getByText('Sample Petstore API')).toBeInTheDocument();
    expect(screen.getByText('1 Paths')).toBeInTheDocument();
    expect(screen.getByText('2 Operations')).toBeInTheDocument();
    expect(screen.getByText('ApiKeyAuth')).toBeInTheDocument();
  });

  it('updates summary when valid YAML is typed into input', async () => {
    render(<OpenApiInspectorTool />);

    const textarea = screen.getByLabelText(/OpenAPI Document/i);

    const newSpec = `openapi: 3.0.1
info:
  title: Custom Widget API
  version: 0.9.0
paths:
  /widgets:
    get:
      summary: Fetch widgets
      responses:
        '200':
          description: OK
`;

    fireEvent.change(textarea, { target: { value: newSpec } });

    await waitFor(() => {
      expect(screen.getByText('Custom Widget API')).toBeInTheDocument();
      expect(screen.getByText('Fetch widgets')).toBeInTheDocument();
    });
  });
});

describe('OpenApiInspectorTool errors and warnings', () => {
  it('renders role="alert" for parse errors', async () => {
    render(<OpenApiInspectorTool />);

    const textarea = screen.getByLabelText(/OpenAPI Document/i);
    fireEvent.change(textarea, { target: { value: '{ malformed json: ' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Document Validation Errors');
    expect(alert).toHaveTextContent(/unexpected end|failed to parse/i);
  });

  it('renders role="alert" for structural validation errors with field paths', async () => {
    render(<OpenApiInspectorTool />);

    const textarea = screen.getByLabelText(/OpenAPI Document/i);
    const invalidSpec = JSON.stringify({
      openapi: '2.0',
      paths: {
        invalidPath: {
          get: {},
        },
      },
    });

    fireEvent.change(textarea, { target: { value: invalidSpec } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('openapi: Unsupported OpenAPI version');
    expect(alert).toHaveTextContent("paths.invalidPath: Path key must start with '/'");
  });

  it('renders warnings for duplicate operationIds and unresolved local refs', async () => {
    render(<OpenApiInspectorTool />);

    const textarea = screen.getByLabelText(/OpenAPI Document/i);
    const warningSpec = `openapi: 3.0.0
info:
  title: Warning Test
  version: 1.0.0
paths:
  /a:
    get:
      operationId: sameId
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/NonExistent'
  /b:
    get:
      operationId: sameId
      responses:
        '200':
          description: OK
`;

    fireEvent.change(textarea, { target: { value: warningSpec } });

    await waitFor(() => {
      expect(screen.getByText(/Document Warnings/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Duplicate operationId: 'sameId'/)).toBeInTheDocument();
    expect(
      screen.getByText(/Unresolved local reference: '#\/components\/schemas\/NonExistent'/)
    ).toBeInTheDocument();
  });
});

describe('OpenApiInspectorTool copy controls and accessibility', () => {
  it('copies normalized JSON and announces via polite status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<OpenApiInspectorTool />);

    const jsonCopyBtn = screen.getByRole('button', { name: 'Copy normalized JSON' });
    await act(async () => {
      fireEvent.click(jsonCopyBtn);
    });

    expect(writeText).toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Normalized JSON copied to clipboard');
  });

  it('copies API summary and announces via polite status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<OpenApiInspectorTool />);

    const summaryCopyBtn = screen.getByRole('button', { name: 'Copy API summary' });
    await act(async () => {
      fireEvent.click(summaryCopyBtn);
    });

    expect(writeText).toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('API summary copied to clipboard');
  });

  it('clears input and output when Clear is clicked', () => {
    render(<OpenApiInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const textarea = screen.getByLabelText(/OpenAPI Document/i);
    expect(textarea).toHaveValue('');
    expect(
      screen.getByText(/Provide a valid OpenAPI 3.0.x or 3.1.x document/i)
    ).toBeInTheDocument();
  });
});

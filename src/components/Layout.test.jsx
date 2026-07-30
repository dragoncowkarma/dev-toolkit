import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout.jsx';

function WorkingTool({ tool }) {
  return <p>{tool.name} content</p>;
}

function BrokenTool() {
  throw new Error('chunk failed to load');
}

function buildTools() {
  return [
    {
      id: 'good',
      name: 'Good Tool',
      description: 'Renders fine.',
      icon: '✓',
      category: 'Test',
      component: WorkingTool,
    },
    {
      id: 'broken',
      name: 'Broken Tool',
      description: 'Always throws.',
      icon: '✗',
      category: 'Test',
      component: BrokenTool,
    },
  ];
}

const TEST_TOOLS = [
  {
    id: 'base64',
    name: 'Base64',
    description: 'Base64 tool description',
    icon: '⌁',
    category: 'Encoder',
    component: () => <div data-testid="tool-base64">Base64 Tool</div>,
  },
  {
    id: 'json',
    name: 'JSON Formatter',
    description: 'JSON tool description',
    icon: '{ }',
    category: 'Formatter',
    component: () => <div data-testid="tool-json">JSON Tool</div>,
  },
];

describe('Layout Component', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('renders the active tool normally', () => {
    render(<Layout tools={buildTools()} defaultToolId="good" />);

    expect(screen.getByText('Good Tool content')).toBeInTheDocument();
  });

  it('shows a fallback while a lazy tool is loading (Suspense regression)', async () => {
    const LazyTool = React.lazy(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ default: ({ tool }) => <p>{tool.name} loaded</p> }),
            10,
          );
        }),
    );
    const tools = [
      {
        id: 'lazy',
        name: 'Lazy Tool',
        description: 'Loads asynchronously.',
        icon: '⏳',
        category: 'Test',
        component: LazyTool,
      },
    ];

    render(<Layout tools={tools} defaultToolId="lazy" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading tool...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Lazy Tool loaded')).toBeInTheDocument();
    });
  });

  it('isolates a failing active tool to the tool area without unmounting the sidebar', () => {
    render(<Layout tools={buildTools()} defaultToolId="broken" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("This tool couldn't be loaded");

    expect(screen.getByRole('button', { name: 'Good Tool' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Broken Tool' })).toBeInTheDocument();
  });

  it('recovers when the user selects a different tool from the sidebar after an error', () => {
    render(<Layout tools={buildTools()} defaultToolId="broken" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Good Tool' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Good Tool content')).toBeInTheDocument();
  });
});

describe('Layout URL hash routing', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
    window.location.hash = '';
    document.title = originalTitle;
  });

  it('defaults to base64 tool and sets hash when no hash is present', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/base64');
    expect(document.title).toBe('Base64 - Dev Toolkit');
  });

  it('loads the tool specified in URL hash on initial render', () => {
    window.location.hash = '#/json';
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('falls back to default tool if URL hash is invalid', () => {
    window.location.hash = '#/nonexistent';
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/base64');
    expect(document.title).toBe('Base64 - Dev Toolkit');
  });

  it('updates URL hash and title when selecting a tool from sidebar', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const jsonBtn = screen.getByRole('button', { name: /JSON Formatter/i });
    fireEvent.click(jsonBtn);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/json');
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('handles window hashchange events for browser back/forward navigation', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();

    window.location.hash = '#/json';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('preserves non-default active tool when non-tool anchor like skip link (#main-content) is activated', () => {
    window.location.hash = '#/json';
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');

    window.location.hash = '#main-content';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('updates URL hash when selecting a tool from sidebar after a non-tool hash (#main-content) is active', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/base64');

    window.location.hash = '#main-content';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#main-content');

    const jsonBtn = screen.getByRole('button', { name: /JSON Formatter/i });
    fireEvent.click(jsonBtn);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/json');
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });
});

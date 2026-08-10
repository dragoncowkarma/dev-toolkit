import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function ToolA() {
  return <div data-testid="tool-a-content">Tool A content</div>;
}

function ToolB() {
  return <div data-testid="tool-b-content">Tool B content</div>;
}

const TOOLS = [
  {
    id: 'tool-a',
    name: 'Tool A',
    description: 'First tool',
    icon: 'A',
    category: 'Alpha',
    component: ToolA,
  },
  {
    id: 'tool-b',
    name: 'Tool B',
    description: 'Second tool',
    icon: 'B',
    category: 'Beta',
    component: ToolB,
  },
];

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('Layout Component', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
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

    expect(within(screen.getByRole('main')).getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading tool...')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByText('Lazy Tool loaded')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
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

describe('Layout tool switching', () => {
  it('renders the default tool component on initial mount', () => {
    render(<Layout tools={TOOLS} defaultToolId="tool-a" />);

    expect(screen.getByTestId('tool-a-content')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-b-content')).not.toBeInTheDocument();
  });

  it('swaps the rendered component when a different tool is selected', async () => {
    const user = userEvent.setup();
    render(<Layout tools={TOOLS} defaultToolId="tool-a" />);

    await user.click(screen.getByRole('button', { name: 'Tool B' }));

    expect(screen.getByTestId('tool-b-content')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-a-content')).not.toBeInTheDocument();
  });

  it('falls back to the first tool when defaultToolId does not match any tool', () => {
    render(<Layout tools={TOOLS} defaultToolId="does-not-exist" />);

    expect(screen.getByTestId('tool-a-content')).toBeInTheDocument();
  });
});

describe('Layout empty tools handling', () => {
  it('renders a fallback message instead of crashing when tools is empty', () => {
    render(<Layout tools={[]} defaultToolId="tool-a" />);

    expect(screen.getByRole('heading', { name: 'No tools available' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tool list' })).not.toBeInTheDocument();
  });
});

describe('Layout breadcrumb', () => {
  it('shows the active tool category in the breadcrumb', () => {
    render(<Layout tools={TOOLS} defaultToolId="tool-a" />);

    expect(screen.getByText('Tools / Alpha')).toBeInTheDocument();
  });

  it('updates the breadcrumb category after switching tools', async () => {
    const user = userEvent.setup();
    render(<Layout tools={TOOLS} defaultToolId="tool-a" />);

    await user.click(screen.getByRole('button', { name: 'Tool B' }));

    expect(screen.getByText('Tools / Beta')).toBeInTheDocument();
    expect(screen.queryByText('Tools / Alpha')).not.toBeInTheDocument();
  });
});

describe('Layout dynamic page title', () => {
  it('shows the active tool name as the page heading', () => {
    render(<Layout tools={TOOLS} defaultToolId="tool-a" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tool A' })).toBeInTheDocument();
  });

  it('changes the page heading when the active tool changes', async () => {
    const user = userEvent.setup();
    render(<Layout tools={TOOLS} defaultToolId="tool-a" />);

    await user.click(screen.getByRole('button', { name: 'Tool B' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Tool B' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Tool A' })).not.toBeInTheDocument();
  });
});

describe('Layout Integration & Focus Trap', () => {
  it('announces active tool changes to screen readers via status element', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const statusElement = screen.getByText(/^Active tool:/);
    expect(statusElement).toHaveTextContent('Active tool: Base64');

    const jsonToolButton = screen.getByRole('button', { name: 'JSON Formatter' });
    fireEvent.click(jsonToolButton);

    expect(statusElement).toHaveTextContent('Active tool: JSON Formatter');
  });

  it('does not steal focus back to top of drawer when Layout re-renders', () => {
    const { container } = render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const openMenuButton = screen.getByRole('button', { name: 'Open tool navigation' });
    fireEvent.click(openMenuButton);

    const closeButton = container.querySelector('.sidebar__mobile-close');
    expect(document.activeElement).toBe(closeButton);

    const collapseButton = screen.getByRole('button', { name: 'Collapse sidebar' });
    collapseButton.focus();
    expect(document.activeElement).toBe(collapseButton);

    fireEvent.click(collapseButton);

    expect(document.activeElement).toBe(collapseButton);
  });

  it('handles mobile drawer dialog lifecycle, background isolation, and focus restoration', () => {
    const { container } = render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const openMenuButton = screen.getByRole('button', { name: 'Open tool navigation' });
    const pageContainer = container.querySelector('.layout__page');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pageContainer).not.toHaveAttribute('aria-hidden');

    openMenuButton.focus();
    fireEvent.click(openMenuButton);

    const dialog = screen.getByRole('dialog', { name: 'Developer tools' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(pageContainer).toHaveAttribute('aria-hidden', 'true');

    const closeButton = within(dialog).getByRole('button', { name: 'Close tool navigation' });
    fireEvent.click(closeButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pageContainer).not.toHaveAttribute('aria-hidden');
    expect(document.activeElement).toBe(openMenuButton);
  });

  it('announces active tool changes when selected from an open drawer without aria-hidden', () => {
    const { container } = render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement).toHaveTextContent('Active tool: Base64');

    const openMenuButton = screen.getByRole('button', { name: 'Open tool navigation' });
    fireEvent.click(openMenuButton);

    expect(statusElement).not.toHaveAttribute('aria-hidden');

    const dialog = screen.getByRole('dialog', { name: 'Developer tools' });
    const jsonToolButton = within(dialog).getByRole('button', { name: 'JSON Formatter' });

    fireEvent.click(jsonToolButton);

    expect(statusElement).toHaveTextContent('Active tool: JSON Formatter');
    expect(statusElement).not.toHaveAttribute('aria-hidden');
  });

  it('force-closes drawer and clears aria-hidden when viewport becomes desktop width', () => {
    let changeHandler;
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: (listener) => {
        changeHandler = listener;
      },
      removeListener: vi.fn(),
      addEventListener: (type, listener) => {
        if (type === 'change') changeHandler = listener;
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const openMenuButton = screen.getByRole('button', { name: 'Open tool navigation' });
    fireEvent.click(openMenuButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(container.querySelector('.layout__page')).toHaveAttribute('aria-hidden', 'true');

    changeHandler({ matches: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('.layout__page')).not.toHaveAttribute('aria-hidden');

    matchMediaSpy.mockRestore();
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

  it('preserves non-default active tool when non-tool anchor like skip link ' +
    '(#main-content) is activated', () => {
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

  it('updates URL hash when selecting a tool from sidebar after a non-tool hash ' +
    '(#main-content) is active', () => {
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

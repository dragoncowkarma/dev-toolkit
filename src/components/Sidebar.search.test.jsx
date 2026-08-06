import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar.jsx';

function buildTools() {
  return [
    {
      id: 'base64',
      name: 'Base64',
      description: 'Encode and decode Base64 strings without leaving your browser.',
      icon: '⌁',
      category: 'Encoder',
    },
    {
      id: 'json',
      name: 'JSON Formatter',
      description: 'Format, validate, and minify JSON with a clear structured view.',
      icon: '{ }',
      category: 'Formatter',
    },
    {
      id: 'uuid',
      name: 'UUID Generator',
      description: 'Generate and format random UUID v4 or time-ordered UUID v7 batches.',
      icon: '⌗',
      category: 'Generator',
    },
  ];
}

function renderSidebar(overrides = {}) {
  const onSelectTool = vi.fn();
  const onToggleCollapse = vi.fn();
  const onCloseMobile = vi.fn();

  const props = {
    tools: buildTools(),
    activeToolId: 'base64',
    isCollapsed: false,
    isMobileOpen: false,
    onSelectTool,
    onToggleCollapse,
    onCloseMobile,
    ...overrides,
  };

  const utils = render(<Sidebar {...props} />);

  return { ...utils, onSelectTool, onToggleCollapse, onCloseMobile };
}

afterEach(() => {
  cleanup();
});

describe('Sidebar search input', () => {
  it('has an accessible name and type="search"', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    expect(input).toHaveAttribute('type', 'search');
  });

  it('narrows the tool list as the user types', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    expect(screen.getByRole('button', { name: /JSON Formatter/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /UUID Generator/ })).not.toBeInTheDocument();
  });

  it('matches on category', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'encoder' } });

    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /JSON Formatter/ })).not.toBeInTheDocument();
  });

  it('shows an empty state message when nothing matches', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'nonexistent-tool-xyz' } });

    expect(screen.getByText('No tools match "nonexistent-tool-xyz"')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
  });

  it('focuses the search input when "/" is pressed outside of an editable element', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/' });

    expect(input).toHaveFocus();
  });

  it('ignores "/" when a text input already has focus', () => {
    render(
      <div>
        <input aria-label="Some other field" />
        <Sidebar
          tools={buildTools()}
          activeToolId="base64"
          isCollapsed={false}
          isMobileOpen={false}
          onSelectTool={vi.fn()}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
        />
      </div>,
    );

    const otherField = screen.getByLabelText('Some other field');
    otherField.focus();
    expect(otherField).toHaveFocus();

    fireEvent.keyDown(window, { key: '/' });

    const searchInput = screen.getByRole('searchbox', { name: 'Filter tools' });
    expect(otherField).toHaveFocus();
    expect(searchInput).not.toHaveFocus();
  });

  it('clears the query and restores the full list on Escape while focused', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();

    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /JSON Formatter/ })).toBeInTheDocument();
  });

  it('removes its keydown listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Sidebar {...{
      tools: buildTools(),
      activeToolId: 'base64',
      isCollapsed: false,
      isMobileOpen: false,
      onSelectTool: vi.fn(),
      onToggleCollapse: vi.fn(),
      onCloseMobile: vi.fn(),
    }} />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});

describe('Sidebar active tool with filtering', () => {
  it('keeps the active tool unchanged when it is filtered out of view', () => {
    const { onSelectTool } = renderSidebar({ activeToolId: 'base64' });

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
    expect(onSelectTool).not.toHaveBeenCalled();

    const jsonButton = screen.getByRole('button', { name: /JSON Formatter/ });
    expect(jsonButton).not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar tool selection', () => {
  it('calls onSelectTool and onCloseMobile and resets the query', () => {
    const { onSelectTool, onCloseMobile } = renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    const jsonButton = screen.getByRole('button', { name: /JSON Formatter/ });
    fireEvent.click(jsonButton);

    expect(onSelectTool).toHaveBeenCalledWith('json');
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
  });
});

describe('Sidebar category controls', () => {
  it('renders an accessible group with an "All" control plus one per category', () => {
    renderSidebar();

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    expect(within(group).getByRole('button', { name: 'All categories' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Encoder' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Formatter' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Generator' })).toBeInTheDocument();
  });

  it('derives a brand new category from tool metadata without a hard-coded list', () => {
    const tools = [
      ...buildTools(),
      {
        id: 'diff',
        name: 'Diff Checker',
        description: 'Compare two blocks of text line by line.',
        icon: '≠',
        category: 'Analyzer',
      },
    ];
    renderSidebar({ tools });

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    expect(within(group).getByRole('button', { name: 'Analyzer' })).toBeInTheDocument();
  });

  it('marks exactly one category control as active with aria-pressed', () => {
    renderSidebar();

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    const buttons = within(group).getAllByRole('button');
    const pressed = buttons.filter((button) => button.getAttribute('aria-pressed') === 'true');

    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('All');
  });

  it('filters the visible tools to the selected category', () => {
    renderSidebar();

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    fireEvent.click(within(group).getByRole('button', { name: 'Encoder' }));

    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /JSON Formatter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /UUID Generator/ })).not.toBeInTheDocument();

    const encoderButton = within(group).getByRole('button', { name: 'Encoder' });
    expect(encoderButton).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'All categories' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('composes the category filter with the text query (intersection)', () => {
    const tools = [
      ...buildTools(),
      {
        id: 'url',
        name: 'URL Encoder',
        description: 'Percent-encode and decode URLs.',
        icon: '↗',
        category: 'Encoder',
      },
    ];
    renderSidebar({ tools });

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    fireEvent.click(within(group).getByRole('button', { name: 'Encoder' }));

    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /URL Encoder/ })).toBeInTheDocument();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'url' } });

    expect(screen.getByRole('button', { name: /URL Encoder/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
    expect(input).toHaveValue('url');
  });

  it('does not clear the typed query when a category is selected', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    fireEvent.click(within(group).getByRole('button', { name: 'Generator' }));

    expect(input).toHaveValue('json');
    expect(screen.queryByRole('button', { name: /JSON Formatter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /UUID Generator/ })).not.toBeInTheDocument();
  });

  it('restores text-only filtering when "All" is selected again', () => {
    renderSidebar();

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    fireEvent.click(within(group).getByRole('button', { name: 'Encoder' }));
    expect(screen.queryByRole('button', { name: /JSON Formatter/ })).not.toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: 'All categories' }));

    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /JSON Formatter/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /UUID Generator/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'All categories' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filters to a real "All" category without colliding with the reset control', () => {
    const tools = [
      ...buildTools(),
      {
        id: 'grep',
        name: 'Grep',
        description: 'Search across every tool.',
        icon: '⌕',
        category: 'All',
      },
    ];
    renderSidebar({ tools });

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    const resetButton = within(group).getByRole('button', { name: 'All categories' });
    const categoryAllButton = within(group).getByRole('button', { name: 'All' });
    expect(resetButton).not.toBe(categoryAllButton);

    fireEvent.click(categoryAllButton);

    expect(screen.getByRole('button', { name: /^Grep/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /JSON Formatter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /UUID Generator/ })).not.toBeInTheDocument();

    expect(categoryAllButton).toHaveAttribute('aria-pressed', 'true');
    expect(resetButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('resets to "All" when the selected category is removed from the tools prop', () => {
    const { rerender } = renderSidebar();

    const group = screen.getByRole('group', { name: 'Filter tools by category' });
    fireEvent.click(within(group).getByRole('button', { name: 'Encoder' }));
    expect(within(group).getByRole('button', { name: 'Encoder' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const toolsWithoutEncoder = buildTools().filter((tool) => tool.category !== 'Encoder');
    rerender(
      <Sidebar
        tools={toolsWithoutEncoder}
        activeToolId="json"
        isCollapsed={false}
        isMobileOpen={false}
        onSelectTool={vi.fn()}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
      />,
    );

    const updatedGroup = screen.getByRole('group', { name: 'Filter tools by category' });
    const buttons = within(updatedGroup).getAllByRole('button');
    const pressed = buttons.filter((button) => button.getAttribute('aria-pressed') === 'true');

    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('All');
    expect(screen.getByRole('button', { name: /JSON Formatter/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /UUID Generator/ })).toBeInTheDocument();
  });
});

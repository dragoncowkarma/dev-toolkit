import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar.jsx';

const TOOLS = [
  { id: 'base64', name: 'Base64', icon: '⌁', category: 'Encoder' },
  { id: 'json', name: 'JSON Formatter', icon: '{ }', category: 'Formatter' },
  { id: 'url', name: 'URL Encoder', icon: '↗', category: 'Encoder' },
];

function renderSidebar(overrides = {}) {
  const onSelectTool = vi.fn();
  const onToggleCollapse = vi.fn();
  const onCloseMobile = vi.fn();

  const utils = render(
    <Sidebar
      tools={TOOLS}
      activeToolId="base64"
      isCollapsed={false}
      isMobileOpen={false}
      onSelectTool={onSelectTool}
      onToggleCollapse={onToggleCollapse}
      onCloseMobile={onCloseMobile}
      {...overrides}
    />,
  );

  return { ...utils, onSelectTool, onToggleCollapse, onCloseMobile };
}

afterEach(() => {
  cleanup();
});

describe('Sidebar desktop rendering', () => {
  it('renders the navigation landmark with every tool', () => {
    renderSidebar();

    expect(screen.getByRole('complementary', { name: 'Developer tools' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Tool list' });
    TOOLS.forEach((tool) => {
      expect(screen.getByRole('button', { name: tool.name })).toBeInTheDocument();
    });
    expect(nav).toBeInTheDocument();
  });

  it('is not in the mobile-open state by default', () => {
    const { container } = renderSidebar();

    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open');
  });
});

describe('Sidebar mobile drawer toggle', () => {
  it('applies the mobile-open class and a visible backdrop when open', () => {
    const { container } = renderSidebar({ isMobileOpen: true });

    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--mobile-open');
    expect(container.querySelector('.sidebar-backdrop')).toHaveClass('sidebar-backdrop--visible');
  });

  it('does not show the mobile-open class or a visible backdrop when closed', () => {
    const { container } = renderSidebar({ isMobileOpen: false });

    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open');
    expect(container.querySelector('.sidebar-backdrop')).not.toHaveClass(
      'sidebar-backdrop--visible',
    );
  });

  it('closes the drawer when the mobile close button is clicked', async () => {
    const user = userEvent.setup();
    const { onCloseMobile } = renderSidebar({ isMobileOpen: true });

    const sidebarLandmark = screen.getByRole('complementary', { name: 'Developer tools' });
    await user.click(
      within(sidebarLandmark).getByRole('button', { name: 'Close tool navigation' }),
    );

    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { container, onCloseMobile } = renderSidebar({ isMobileOpen: true });

    await user.click(container.querySelector('.sidebar-backdrop'));

    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it('also closes the drawer when a tool is selected from the mobile drawer', async () => {
    const user = userEvent.setup();
    const { onSelectTool, onCloseMobile } = renderSidebar({ isMobileOpen: true });

    await user.click(screen.getByRole('button', { name: 'JSON Formatter' }));

    expect(onSelectTool).toHaveBeenCalledWith('json');
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar collapse mode', () => {
  it('applies the collapsed class and reflects the expand label', () => {
    const { container } = renderSidebar({ isCollapsed: true });

    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--collapsed');
    const collapseButton = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the collapse label and aria-expanded true when expanded', () => {
    renderSidebar({ isCollapsed: false });

    const collapseButton = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('adds a title attribute to tool buttons only while collapsed', () => {
    const { rerender } = renderSidebar({ isCollapsed: true });

    expect(screen.getByRole('button', { name: 'Base64' })).toHaveAttribute('title', 'Base64');

    rerender(
      <Sidebar
        tools={TOOLS}
        activeToolId="base64"
        isCollapsed={false}
        isMobileOpen={false}
        onSelectTool={vi.fn()}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Base64' })).not.toHaveAttribute('title');
  });

  it('invokes onToggleCollapse when the collapse button is activated', async () => {
    const user = userEvent.setup();
    const { onToggleCollapse } = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar tool icons and active state', () => {
  it('renders each tool icon', () => {
    renderSidebar();

    expect(screen.getByText('⌁')).toBeInTheDocument();
    expect(screen.getByText('{ }')).toBeInTheDocument();
    expect(screen.getByText('↗')).toBeInTheDocument();
  });

  it('highlights the active tool with the active class and aria-current', () => {
    renderSidebar({ activeToolId: 'json' });

    const activeButton = screen.getByRole('button', { name: 'JSON Formatter' });
    expect(activeButton).toHaveClass('sidebar__tool--active');
    expect(activeButton).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark inactive tools as current', () => {
    renderSidebar({ activeToolId: 'json' });

    const inactiveButton = screen.getByRole('button', { name: 'Base64' });
    expect(inactiveButton).not.toHaveClass('sidebar__tool--active');
    expect(inactiveButton).not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar keyboard navigation', () => {
  it('lets keyboard users Tab through the tool buttons in order', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const baseButton = screen.getByRole('button', { name: 'Base64' });
    baseButton.focus();
    expect(baseButton).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'JSON Formatter' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'URL Encoder' })).toHaveFocus();
  });

  it('activates a focused tool button with the Enter key', async () => {
    const user = userEvent.setup();
    const { onSelectTool } = renderSidebar();

    const jsonButton = screen.getByRole('button', { name: 'JSON Formatter' });
    jsonButton.focus();
    expect(jsonButton).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onSelectTool).toHaveBeenCalledWith('json');
  });

  it('activates a focused tool button with the Space key', async () => {
    const user = userEvent.setup();
    const { onSelectTool } = renderSidebar();

    const baseButton = screen.getByRole('button', { name: 'Base64' });
    baseButton.focus();
    expect(baseButton).toHaveFocus();

    await user.keyboard('[Space]');

    expect(onSelectTool).toHaveBeenCalledWith('base64');
  });

  it('excludes the hidden backdrop from the tab order when the drawer is closed', () => {
    const { container } = renderSidebar({ isMobileOpen: false });

    expect(container.querySelector('.sidebar-backdrop')).toHaveAttribute('tabindex', '-1');
  });

  it('includes the backdrop in the tab order when the drawer is open', () => {
    const { container } = renderSidebar({ isMobileOpen: true });

    expect(container.querySelector('.sidebar-backdrop')).toHaveAttribute('tabindex', '0');
  });
});

describe('Sidebar Mobile Focus Trap', () => {
  it('traps focus inside the mobile drawer when opened', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Sidebar
        tools={TOOLS}
        activeToolId="base64"
        isCollapsed={false}
        isMobileOpen={true}
        onSelectTool={() => {}}
        onToggleCollapse={() => {}}
        onCloseMobile={handleClose}
      />,
    );

    const closeButton = container.querySelector('.sidebar__mobile-close');
    const collapseButton = container.querySelector('.sidebar__collapse');

    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(collapseButton);

    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeButton);
  });

  it('closes mobile drawer on Escape key press', () => {
    const handleClose = vi.fn();
    render(
      <Sidebar
        tools={TOOLS}
        activeToolId="base64"
        isCollapsed={false}
        isMobileOpen={true}
        onSelectTool={() => {}}
        onToggleCollapse={() => {}}
        onCloseMobile={handleClose}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

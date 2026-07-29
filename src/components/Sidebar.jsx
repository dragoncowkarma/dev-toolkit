import React from 'react';
import './Sidebar.css';

/**
 * Renders the tool navigation for desktop and mobile layouts.
 *
 * @param {object} props Component props.
 * @param {Array<object>} props.tools Available developer tools.
 * @param {string} props.activeToolId Currently selected tool identifier.
 * @param {boolean} props.isCollapsed Whether the desktop sidebar is collapsed.
 * @param {boolean} props.isMobileOpen Whether the mobile drawer is visible.
 * @param {(toolId: string) => void} props.onSelectTool Tool selection callback.
 * @param {() => void} props.onToggleCollapse Desktop collapse callback.
 * @param {() => void} props.onCloseMobile Mobile drawer close callback.
 * @returns {React.JSX.Element} The sidebar and mobile backdrop.
 */
export default function Sidebar({
  tools,
  activeToolId,
  isCollapsed,
  isMobileOpen,
  onSelectTool,
  onToggleCollapse,
  onCloseMobile,
}) {
  const sidebarClassName = [
    'sidebar',
    isCollapsed ? 'sidebar--collapsed' : '',
    isMobileOpen ? 'sidebar--mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleToolSelect = (toolId) => {
    onSelectTool(toolId);
    onCloseMobile();
  };

  return (
    <>
      <aside
        id="tool-navigation"
        className={sidebarClassName}
        aria-label="Developer tools"
      >
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <span className="sidebar__brand-mark" aria-hidden="true">
              ⚡
            </span>
            <span className="sidebar__brand-copy">
              <strong>Dev Toolkit</strong>
              <small>Developer utilities</small>
            </span>
          </div>

          <button
            className="sidebar__mobile-close"
            type="button"
            onClick={onCloseMobile}
            aria-label="Close tool navigation"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Tool list">
          <p className="sidebar__section-label">Tools</p>
          <ul>
            {tools.map((tool) => {
              const isActive = tool.id === activeToolId;

              return (
                <li key={tool.id}>
                  <button
                    className={`sidebar__tool ${isActive ? 'sidebar__tool--active' : ''}`}
                    type="button"
                    onClick={() => handleToolSelect(tool.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? tool.name : undefined}
                  >
                    <span className="sidebar__tool-icon" aria-hidden="true">
                      {tool.icon}
                    </span>
                    <span className="sidebar__tool-name">{tool.name}</span>
                    {isActive && (
                      <span className="sidebar__active-indicator" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar__footer">
          <a
            className="sidebar__github"
            href="https://github.com/dragoncowkarma/dev-toolkit"
            target="_blank"
            rel="noopener noreferrer"
            title={isCollapsed ? 'View on GitHub' : undefined}
          >
            <span className="sidebar__github-icon" aria-hidden="true">
              ◇
            </span>
            <span className="sidebar__github-label">View on GitHub</span>
          </a>

          <button
            className="sidebar__collapse"
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="sidebar__collapse-icon" aria-hidden="true">
              ‹
            </span>
            <span className="sidebar__collapse-label">Collapse sidebar</span>
          </button>
        </div>
      </aside>

      <button
        className={`sidebar-backdrop ${isMobileOpen ? 'sidebar-backdrop--visible' : ''}`}
        type="button"
        onClick={onCloseMobile}
        aria-label="Close tool navigation"
        tabIndex={isMobileOpen ? 0 : -1}
      />
    </>
  );
}

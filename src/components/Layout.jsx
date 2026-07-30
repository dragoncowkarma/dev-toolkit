import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import './Layout.css';

/**
 * Provides the responsive application shell and renders the active tool.
 *
 * @param {object} props Component props.
 * @param {Array<object>} props.tools Tool definitions and their React components.
 * @param {string} props.defaultToolId Initially selected tool identifier.
 * @returns {React.JSX.Element} The main application layout.
 */
export default function Layout({ tools, defaultToolId }) {
  const isToolRouteHash = (hash) => {
    if (!hash || hash === '#' || hash === '#/') {
      return true;
    }
    if (hash.startsWith('#/')) {
      return true;
    }
    const rawId = hash.startsWith('#') ? hash.substring(1) : hash;
    return tools.some((tool) => tool.id === rawId);
  };

  const getToolIdFromHash = (hash = window.location.hash) => {
    let rawId = '';
    if (hash.startsWith('#/')) {
      rawId = hash.substring(2);
    } else if (hash.startsWith('#')) {
      rawId = hash.substring(1);
    }
    if (tools.some((tool) => tool.id === rawId)) {
      return rawId;
    }
    return null;
  };

  const [activeToolId, setActiveToolId] = useState(() => {
    const hashId = getToolIdFromHash();
    if (hashId) {
      return hashId;
    }
    return tools.some((tool) => tool.id === defaultToolId)
      ? defaultToolId
      : tools[0]?.id;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeToolId) ?? tools[0],
    [activeToolId, tools],
  );

  useEffect(() => {
    if (activeTool) {
      document.title = `${activeTool.name} - Dev Toolkit`;
    } else {
      document.title = 'Dev Toolkit';
    }
  }, [activeTool]);

  useEffect(() => {
    const expectedHash = `#/${activeToolId}`;
    const currentHash = window.location.hash;

    if (currentHash !== expectedHash) {
      if (currentHash && !isToolRouteHash(currentHash)) {
        return;
      }

      const isInvalidToolRoute =
        isToolRouteHash(currentHash) && !getToolIdFromHash(currentHash);
      if (isInvalidToolRoute && window.history?.replaceState) {
        window.history.replaceState(null, '', expectedHash);
      } else {
        window.location.hash = expectedHash;
      }
    }
  }, [activeToolId]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const hashId = getToolIdFromHash(hash);
      if (hashId) {
        setActiveToolId(hashId);
      } else if (isToolRouteHash(hash)) {
        const fallbackId = tools.some((tool) => tool.id === defaultToolId)
          ? defaultToolId
          : tools[0]?.id;
        setActiveToolId(fallbackId);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [tools, defaultToolId]);

  useEffect(() => {
    if (!isMobileOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  if (!activeTool) {
    return (
      <main className="layout__empty">
        <h1>No tools available</h1>
        <p>Add a tool definition to start using Dev Toolkit.</p>
      </main>
    );
  }

  const ActiveToolComponent = activeTool.component;
  const layoutClassName = [
    'layout',
    isSidebarCollapsed ? 'layout--sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClassName}>
      <a className="layout__skip-link" href="#main-content">
        Skip to main content
      </a>

      <Sidebar
        tools={tools}
        activeToolId={activeTool.id}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileOpen}
        onSelectTool={setActiveToolId}
        onToggleCollapse={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className="layout__page">
        <header className="layout__mobile-header">
          <button
            className="layout__menu-button"
            type="button"
            onClick={() => setIsMobileOpen(true)}
            aria-controls="tool-navigation"
            aria-expanded={isMobileOpen}
            aria-label="Open tool navigation"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>

          <div className="layout__mobile-brand">
            <span aria-hidden="true">⚡</span>
            <strong>Dev Toolkit</strong>
          </div>

          <span className="layout__mobile-tool-icon" aria-hidden="true">
            {activeTool.icon}
          </span>
        </header>

        <div className="layout__content">
          <header className="layout__content-header">
            <div>
              <p className="layout__breadcrumb">Tools / {activeTool.category}</p>
              <h1>{activeTool.name}</h1>
            </div>
            <span className="layout__local-badge">
              <span aria-hidden="true" />
              Runs locally
            </span>
          </header>

          <main id="main-content" className="layout__main" tabIndex="-1">
            <ActiveToolComponent
              tool={activeTool}
              onBack={() => setActiveToolId(defaultToolId)}
            />
          </main>

          <footer className="layout__footer">
            <p>Private by design. Your data stays in your browser.</p>
            <span>Built by the autonomous AI swarm.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

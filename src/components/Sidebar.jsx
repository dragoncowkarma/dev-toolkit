import { useEffect, useRef, useState } from 'react';
import './Sidebar.css';
import {
  ALL_CATEGORY,
  filterTools,
  filterToolsByCategory,
  getToolCategories,
} from './sidebar.utils.js';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Visible label for the reset control. Kept separate from `ALL_CATEGORY`
 * (the state sentinel) so a real "All" metadata category never collides
 * with it. */
const ALL_CATEGORIES_LABEL = 'All';

/** Accessible name for the reset control, distinct from `ALL_CATEGORIES_LABEL`
 * so it never shares an accessible name with a real "All" metadata category —
 * both would otherwise be indistinguishable to screen-reader/voice-control
 * users despite performing opposite actions. */
const ALL_CATEGORIES_ARIA_LABEL = 'All categories';

function isEditableTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return EDITABLE_TAGS.has(target.tagName);
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Checks if an element is visible and enabled in the DOM.
 *
 * @param {Element} el Target element to test.
 * @returns {boolean} True if the element is visible and enabled.
 */
function isElementVisibleAndEnabled(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.disabled) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.hasAttribute('hidden')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }

  return true;
}

/**
 * Temporarily hides non-drawer background DOM elements from assistive
 * technology by setting `aria-hidden="true"`, and returns a restore function
 * to revert back to their exact prior state.
 *
 * @param {HTMLElement|null} sidebarEl The drawer element.
 * @returns {() => void} Function that restores original `aria-hidden` state.
 */
function hideBackgroundElements(sidebarEl) {
  if (!sidebarEl) return () => {};

  const elementsToRestore = [];
  const backdrop = sidebarEl.nextElementSibling?.classList.contains('sidebar-backdrop')
    ? sidebarEl.nextElementSibling
    : document.querySelector('.sidebar-backdrop');

  let current = sidebarEl;
  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;

    Array.from(parent.children).forEach((child) => {
      const isLiveRegion =
        child.matches?.('[role="status"], [role="alert"], [aria-live]') ||
        child.querySelector?.('[role="status"], [role="alert"], [aria-live]');

      if (
        child !== current &&
        child !== sidebarEl &&
        child !== backdrop &&
        !isLiveRegion &&
        !child.contains(sidebarEl)
      ) {
        const hadAriaHidden = child.hasAttribute('aria-hidden');
        const prevAriaHidden = child.getAttribute('aria-hidden');

        elementsToRestore.push({
          element: child,
          hadAriaHidden,
          prevAriaHidden,
        });

        child.setAttribute('aria-hidden', 'true');
      }
    });

    current = parent;
  }

  return () => {
    elementsToRestore.forEach(({ element, hadAriaHidden, prevAriaHidden }) => {
      if (!document.body.contains(element)) return;
      if (hadAriaHidden) {
        element.setAttribute('aria-hidden', prevAriaHidden);
      } else {
        element.removeAttribute('aria-hidden');
      }
    });
  };
}

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
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const searchInputRef = useRef(null);
  const sidebarRef = useRef(null);
  const onCloseMobileRef = useRef(onCloseMobile);

  useEffect(() => {
    onCloseMobileRef.current = onCloseMobile;
  });

  // Sidebar does not own the desktop-breakpoint transition: Layout is the
  // single owner that watches the viewport and passes `isMobileOpen` down.
  // See `breakpoints.js` for the shared breakpoint contract.

  useEffect(() => {
    if (!isMobileOpen) return undefined;

    const previousFocus = document.activeElement;
    const restoreBackground = hideBackgroundElements(sidebarRef.current);

    const getFocusableElements = () => {
      if (!sidebarRef.current) return [];
      const candidates = Array.from(sidebarRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      return candidates.filter(isElementVisibleAndEnabled);
    };

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        const search = searchInputRef.current;
        if (search && document.activeElement === search && search.value !== '') {
          return;
        }
        onCloseMobileRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const elements = getFocusableElements();
        if (elements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = elements[0];
        const lastElement = elements[elements.length - 1];

        if (event.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !sidebarRef.current.contains(document.activeElement)
          ) {
            lastElement.focus();
            event.preventDefault();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !sidebarRef.current.contains(document.activeElement)
          ) {
            firstElement.focus();
            event.preventDefault();
          }
        }
      }
    };

    const handleFocusIn = (event) => {
      if (!sidebarRef.current) return;
      if (!sidebarRef.current.contains(event.target)) {
        const elements = getFocusableElements();
        if (elements.length > 0) {
          elements[0].focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      restoreBackground();
      if (
        previousFocus &&
        typeof previousFocus.focus === 'function' &&
        document.body.contains(previousFocus)
      ) {
        previousFocus.focus();
      }
    };
  }, [isMobileOpen]);

  const sidebarClassName = [
    'sidebar',
    isCollapsed ? 'sidebar--collapsed' : '',
    isMobileOpen ? 'sidebar--mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const categories = getToolCategories(tools);
  // If the selected category disappeared from the tools prop (e.g. tools list changed),
  // fallback to ALL_CATEGORY so we don't display an empty state for a category
  // that no longer exists.
  const effectiveCategory =
    selectedCategory === ALL_CATEGORY || categories.includes(selectedCategory)
      ? selectedCategory
      : ALL_CATEGORY;
  const filteredTools = filterToolsByCategory(filterTools(tools, query), effectiveCategory);

  const handleToolSelect = (toolId) => {
    onSelectTool(toolId);
    onCloseMobile();
    setQuery('');
  };

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === '/') {
        if (isEditableTarget(document.activeElement)) {
          return;
        }

        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setQuery('');
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      <aside
        ref={sidebarRef}
        id="tool-navigation"
        className={sidebarClassName}
        aria-label="Developer tools"
        role={isMobileOpen ? 'dialog' : undefined}
        aria-modal={isMobileOpen ? 'true' : undefined}
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
          <div className="sidebar__search">
            <input
              ref={searchInputRef}
              className="sidebar__search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter tools…"
              aria-label="Filter tools"
              title={isCollapsed ? 'Filter tools' : undefined}
            />
          </div>

          <div
            className="sidebar__categories"
            role="group"
            aria-label="Filter tools by category"
          >
            <button
              className={[
                'sidebar__category',
                effectiveCategory === ALL_CATEGORY ? 'sidebar__category--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              type="button"
              aria-pressed={effectiveCategory === ALL_CATEGORY}
              aria-label={ALL_CATEGORIES_ARIA_LABEL}
              onClick={() => setSelectedCategory(ALL_CATEGORY)}
            >
              {ALL_CATEGORIES_LABEL}
            </button>
            {categories.map((category) => (
              <button
                key={category}
                className={[
                  'sidebar__category',
                  effectiveCategory === category ? 'sidebar__category--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                aria-pressed={effectiveCategory === category}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {filteredTools.length > 0 ? (
            <ul>
              {filteredTools.map((tool) => {
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
          ) : (
            <p className="sidebar__empty-state">No tools match &quot;{query.trim()}&quot;</p>
          )}
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
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}

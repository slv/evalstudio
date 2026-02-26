import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useProjectId } from "../hooks/useProjectId";
import type { ProjectInfo } from "../lib/api";

interface SidebarProps {
  projectName: string;
  projects?: ProjectInfo[];
}

export function Sidebar({ projectName, projects }: SidebarProps) {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const showSwitcher = projects && projects.length > 1;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [switcherOpen]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        {showSwitcher ? (
          <div className="project-switcher" ref={switcherRef}>
            <button
              className="project-switcher-btn"
              onClick={() => setSwitcherOpen(!switcherOpen)}
            >
              <span className="project-switcher-name">{projectName}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`project-switcher-chevron${switcherOpen ? " open" : ""}`}>
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {switcherOpen && (
              <div className="project-switcher-dropdown">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`project-switcher-item${p.id === projectId ? " active" : ""}`}
                    onClick={() => {
                      if (p.id !== projectId) {
                        navigate(`/projects/${p.id}`);
                      }
                      setSwitcherOpen(false);
                    }}
                  >
                    <span className="project-switcher-item-name">{p.name}</span>
                    {p.id === projectId && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <h2 className="sidebar-project-name">{projectName}</h2>
        )}
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="."
          end
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-icon">&#9632;</span>
          Dashboard
        </NavLink>

        <NavLink
          to="evals"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-icon">&#9654;</span>
          Evals
        </NavLink>

        <div className="sidebar-divider" />

        <NavLink
          to="agents"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-icon">&#9881;</span>
          Agents
        </NavLink>

        <NavLink
          to="scenarios"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-icon">&#9998;</span>
          Scenarios
        </NavLink>

        <NavLink
          to="personas"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-icon">&#9786;</span>
          Personas
        </NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-section-title">Settings</div>

        <NavLink
          to="settings/general"
          className={({ isActive }) =>
            `sidebar-link sidebar-link-nested ${isActive ? "active" : ""}`
          }
        >
          General
        </NavLink>

        <NavLink
          to="settings/llm-providers"
          className={({ isActive }) =>
            `sidebar-link sidebar-link-nested ${isActive ? "active" : ""}`
          }
        >
          LLM Providers
        </NavLink>

        <NavLink
          to="settings/users"
          className={({ isActive }) =>
            `sidebar-link sidebar-link-nested ${isActive ? "active" : ""}`
          }
        >
          Users
        </NavLink>
      </nav>
    </aside>
  );
}

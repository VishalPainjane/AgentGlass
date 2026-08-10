/**
 * Settings Page v1 — Real settings with persistence
 *
 * Sections:
 * - Connection (daemon host/port, status, reconnect)
 * - Storage & Retention (data dir, retention, clear)
 * - UI Preferences (theme, dense mode)
 * - Export (default format)
 * - Keyboard Shortcuts reference
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import TopBar from "../components/TopBar";
import ConnectionStatus from "../components/ConnectionStatus";
import { useTraceStore } from "../hooks/useTraceStore";
import { getDaemonHttpBaseUrl, daemonHttp } from "../lib/daemonApi";

/* ------------------------------------------------------------------ */
/*  Settings Schema                                                   */
/* ------------------------------------------------------------------ */

interface AgentGlassSettings {
  connection: {
    host: string;
    port: number;
  };
  storage: {
    retentionDays: number;
  };
  ui: {
    theme: "dark" | "light";
    denseMode: boolean;
  };
  export: {
    defaultFormat: "pytest" | "json";
  };
}

const DEFAULT_SETTINGS: AgentGlassSettings = {
  connection: {
    host: "127.0.0.1",
    port: 8765,
  },
  storage: {
    retentionDays: 30,
  },
  ui: {
    theme: "dark",
    denseMode: false,
  },
  export: {
    defaultFormat: "pytest",
  },
};

const STORAGE_KEY = "agentglass-settings";

function loadSettings(): AgentGlassSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AgentGlassSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                    */
/* ------------------------------------------------------------------ */

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h2 className="settings-section-title">{title}</h2>
        {description && <p className="settings-section-desc">{description}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-label">{label}</span>
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Page                                                     */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const [settings, setSettings] = useState<AgentGlassSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"checking" | "ok" | "error">("checking");
  const [healthDetails, setHealthDetails] = useState<string>("");

  const connectionStatus = useTraceStore((s) => s.connectionStatus);
  const clearEvents = useTraceStore((s) => s.clearEvents);
  const events = useTraceStore((s) => s.events);
  const traces = useTraceStore((s) => s.traces);
  const denseMode = useTraceStore((s) => s.denseMode);
  const setDenseMode = useTraceStore((s) => s.setDenseMode);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setDenseMode(loaded.ui.denseMode);
  }, [setDenseMode]);

  // Sync theme when settings change
  useEffect(() => {
    const stored = localStorage.getItem("agentglass-theme");
    if (stored) {
      setSettings((prev) => ({
        ...prev,
        ui: { ...prev.ui, theme: stored as "dark" | "light" },
      }));
    }
  }, []);

  // Check daemon health
  const checkHealth = useCallback(async () => {
    setHealthStatus("checking");
    try {
      const baseUrl = getDaemonHttpBaseUrl();
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        setHealthStatus("ok");
        setHealthDetails(`DB: ${data.db || "unknown"}`);
      } else {
        setHealthStatus("error");
        setHealthDetails(`HTTP ${res.status}`);
      }
    } catch (e) {
      setHealthStatus("error");
      setHealthDetails("Daemon unreachable");
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const updateSettings = useCallback(
    (updater: (prev: AgentGlassSettings) => AgentGlassSettings) => {
      setSettings((prev) => {
        const next = updater(prev);
        saveSettings(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return next;
      });
    },
    []
  );

  const handleThemeChange = useCallback(
    (theme: "dark" | "light") => {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("agentglass-theme", theme);
      updateSettings((prev) => ({
        ...prev,
        ui: { ...prev.ui, theme },
      }));
    },
    [updateSettings]
  );

  const handleClearLocalData = useCallback(() => {
    if (window.confirm("Clear all locally cached trace data in the dashboard? This does not affect the daemon database.")) {
      clearEvents();
    }
  }, [clearEvents]);

  const handleClearDaemonDb = useCallback(async () => {
    if (window.confirm("PERMANENTLY DELETE all traces and events from the local daemon database? This cannot be undone.")) {
      try {
        const res = await fetch(daemonHttp("/v1/system/clear"), { method: "POST" });
        if (res.ok) {
          clearEvents(); // also clear local store to stay in sync
          alert("Daemon database cleared successfully.");
        } else {
          throw new Error("Failed to clear daemon database");
        }
      } catch (err) {
        alert("Error clearing daemon database: " + (err instanceof Error ? err.message : String(err)));
      }
    }
  }, [clearEvents]);

  return (
    <div className="dashboard">
      <TopBar mode="settings" />
      <div className="dashboard-body settings-page-body">
        <div className="settings-page">
          <div className="settings-page-header">
            <h1 className="settings-page-title">Settings </h1>
            <p className="settings-page-subtitle">
              Configure your AgentGlass dashboard and daemon connection preferences.
            </p>
            {saved && (
              <span className="settings-saved-badge">✓ Settings saved</span>
            )}
          </div>

          {/* ---- Connection ---- */}
          <SettingsSection
            title="Connection"
            description="Daemon WebSocket and HTTP connection configuration."
          >
            <SettingsRow label="Daemon Host" hint="The hostname or IP where the daemon is running.">
              <input
                type="text"
                className="settings-input"
                value={settings.connection.host}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    connection: { ...prev.connection, host: e.target.value },
                  }))
                }
                id="settings-daemon-host"
              />
            </SettingsRow>

            <SettingsRow label="Daemon Port" hint="The port number for the local daemon (default: 8765).">
              <input
                type="number"
                className="settings-input settings-input-narrow"
                value={settings.connection.port}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    connection: { ...prev.connection, port: Number(e.target.value) || 8765 },
                  }))
                }
                min={1}
                max={65535}
                id="settings-daemon-port"
              />
            </SettingsRow>

            <SettingsRow label="WebSocket Status">
              <div className="settings-connection-status">
                <ConnectionStatus />
              </div>
            </SettingsRow>

            <SettingsRow label="Daemon Health">
              <div className="settings-health-row">
                <span
                  className={`settings-health-badge settings-health-badge-${healthStatus}`}
                >
                  {healthStatus === "checking"
                    ? "Checking…"
                    : healthStatus === "ok"
                      ? "Healthy"
                      : "Unreachable"}
                </span>
                {healthDetails && (
                  <span className="settings-health-detail">{healthDetails}</span>
                )}
                <button
                  type="button"
                  className="settings-btn settings-btn-sm"
                  onClick={checkHealth}
                  id="settings-check-health-btn"
                >
                  Recheck
                </button>
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* ---- Storage & Retention ---- */}
          <SettingsSection
            title="Storage & Retention"
            description="Manage local trace data and cache storage."
          >
            <SettingsRow
              label="Data Directory"
              hint="Where the daemon stores trace data. Override with AGENTGLASS_DATA_DIR."
            >
              <code className="settings-code">.agentglass/</code>
            </SettingsRow>

            <SettingsRow
              label="Retention Period"
              hint="Number of days to keep trace data before cleanup."
            >
              <div className="settings-inline">
                <input
                  type="number"
                  className="settings-input settings-input-narrow"
                  value={settings.storage.retentionDays}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      storage: { ...prev.storage, retentionDays: Math.max(1, Number(e.target.value) || 30) },
                    }))
                  }
                  min={1}
                  max={365}
                  id="settings-retention-days"
                />
                <span className="settings-unit">days</span>
              </div>
            </SettingsRow>

            <SettingsRow label="Dashboard Cache" hint="Events and traces currently loaded in the browser.">
              <div className="settings-inline">
                <span className="settings-stat">
                  {events.length} events • {traces.length} traces
                </span>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={handleClearLocalData}
                  id="settings-clear-cache-btn"
                >
                  Clear Browser Cache
                </button>
              </div>
            </SettingsRow>

            <SettingsRow label="Daemon Database" hint="Permanently delete all data from the local SQLite store.">
              <button
                type="button"
                className="settings-btn settings-btn-danger"
                onClick={handleClearDaemonDb}
                id="settings-clear-daemon-btn"
              >
                Clear Daemon Database (Permanent)
              </button>
            </SettingsRow>
          </SettingsSection>

          {/* ---- UI Preferences ---- */}
          <SettingsSection
            title="UI Preferences"
            description="Customize the dashboard appearance and behavior."
          >
            <SettingsRow label="Theme" hint="Switch between dark and light mode.">
              <div className="settings-theme-toggle">
                <button
                  type="button"
                  className={`settings-theme-btn ${settings.ui.theme === "dark" ? "settings-theme-btn-active" : ""}`}
                  onClick={() => handleThemeChange("dark")}
                  id="settings-theme-dark"
                >
                  🌙 Dark
                </button>
                <button
                  type="button"
                  className={`settings-theme-btn ${settings.ui.theme === "light" ? "settings-theme-btn-active" : ""}`}
                  onClick={() => handleThemeChange("light")}
                  id="settings-theme-light"
                >
                  ☀️ Light
                </button>
              </div>
            </SettingsRow>

            <SettingsRow label="Dense Mode" hint="Compact layout for high-density views.">
              <label className="settings-toggle" id="settings-dense-mode">
                <input
                  type="checkbox"
                  checked={settings.ui.denseMode}
                  onChange={(e) => {
                    const isDense = e.target.checked;
                    setDenseMode(isDense);
                    updateSettings((prev) => ({
                      ...prev,
                      ui: { ...prev.ui, denseMode: isDense },
                    }));
                  }}
                />
                <span className="settings-toggle-slider" />
              </label>
            </SettingsRow>

          </SettingsSection>

          {/* ---- Export ---- */}
          <SettingsSection
            title="Export"
            description="Default export format for trace data."
          >
            <SettingsRow label="Default Format" hint="The format used when exporting traces from the dashboard.">
              <select
                className="settings-select"
                value={settings.export.defaultFormat}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    export: { ...prev.export, defaultFormat: e.target.value as "pytest" | "json" },
                  }))
                }
                id="settings-export-format"
              >
                <option value="pytest">Pytest Fixtures</option>
                <option value="json">Raw JSON</option>
              </select>
            </SettingsRow>
          </SettingsSection>

          {/* ---- Keyboard Shortcuts ---- */}
          <SettingsSection
            title="Keyboard Shortcuts"
            description="Available keyboard shortcuts across the dashboard."
          >
            <div className="settings-shortcuts-grid">
              <div className="settings-shortcut">
                <kbd>↑</kbd> <kbd>↓</kbd>
                <span>Navigate trace list</span>
              </div>
              <div className="settings-shortcut">
                <kbd>Enter</kbd>
                <span>Select trace</span>
              </div>
              <div className="settings-shortcut">
                <kbd>Esc</kbd>
                <span>Close dropdown</span>
              </div>
              <div className="settings-shortcut">
                <kbd>Space</kbd>
                <span>Play/Pause scrubber</span>
              </div>
              <div className="settings-shortcut">
                <kbd>←</kbd> <kbd>→</kbd>
                <span>Step scrubber</span>
              </div>
            </div>
          </SettingsSection>

          <div className="settings-footer">
            <span className="settings-footer-text">
              AgentGlass v0.1.0 • Local-first agent observability
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

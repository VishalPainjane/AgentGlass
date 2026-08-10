const DEFAULT_DAEMON_HTTP_URL = "http://127.0.0.1:8765";
const DEFAULT_DAEMON_WS_URL = "ws://127.0.0.1:8765/ws";
const STORAGE_KEY = "agentglass-settings";

interface ConnectionSettings {
  host?: string;
  port?: string;
}

interface StorageSettings {
  connection?: ConnectionSettings;
}

function getConnectionFromStorage(): ConnectionSettings | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const settings: StorageSettings = JSON.parse(stored);
    return settings.connection ?? null;
  } catch {
    return null;
  }
}

function getDaemonBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_DAEMON_HTTP_URL;
  if (envUrl) return envUrl;

  const conn = getConnectionFromStorage();
  if (conn?.host && conn?.port) {
    return `http://${conn.host}:${conn.port}`;
  }

  return DEFAULT_DAEMON_HTTP_URL;
}

export function getDaemonHttpBaseUrl(): string {
  return getDaemonBaseUrl();
}

export function getDaemonWsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_DAEMON_WS_URL;
  if (envUrl) return envUrl;

  const conn = getConnectionFromStorage();
  if (conn?.host && conn?.port) {
    return `ws://${conn.host}:${conn.port}/ws`;
  }

  const httpBase = getDaemonBaseUrl();
  const protocol = httpBase.startsWith("https://") ? "wss://" : "ws://";
  const base = httpBase.replace(/^https?:\/\//, "");
  return `${protocol}${base}/ws`;
}

export function daemonHttp(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getDaemonHttpBaseUrl()}${normalizedPath}`;
}

export function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
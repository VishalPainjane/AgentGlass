const DEFAULT_DAEMON_HTTP_URL = "http://127.0.0.1:7777";
const DEFAULT_DAEMON_WS_URL = "ws://127.0.0.1:7777/ws";

export function getDaemonHttpBaseUrl(): string {
  return process.env.NEXT_PUBLIC_DAEMON_HTTP_URL ?? DEFAULT_DAEMON_HTTP_URL;
}

export function getDaemonWsUrl(): string {
  if (process.env.NEXT_PUBLIC_DAEMON_WS_URL) {
    return process.env.NEXT_PUBLIC_DAEMON_WS_URL;
  }

  const httpBase = getDaemonHttpBaseUrl();

  if (httpBase.startsWith("https://")) {
    return `${httpBase.replace("https://", "wss://")}/ws`;
  }

  if (httpBase.startsWith("http://")) {
    return `${httpBase.replace("http://", "ws://")}/ws`;
  }

  return DEFAULT_DAEMON_WS_URL;
}

export function daemonHttp(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getDaemonHttpBaseUrl()}${normalizedPath}`;
}

export function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

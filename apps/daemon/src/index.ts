/**
 * AgentGlass Daemon — Local Ingestion & WebSocket Routing
 *
 * Accepts telemetry events via HTTP POST, persists them to SQLite,
 * broadcasts them over WebSocket, and serves REST query endpoints
 * for the dashboard.
 */

import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { closeDb, dbPath, getRecentEvents } from "./db";
import { handleRoute, setBroadcastCallback } from "./handlers";
import { rowToJson } from "./types";

const host = process.env.AGENTGLASS_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENTGLASS_DAEMON_PORT ?? "8765");

const wsClients = new Set<WebSocket>();

function broadcastEvent(event: Record<string, unknown>): void {
  const message = JSON.stringify({ type: "event", event });
  for (const client of wsClients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

setBroadcastCallback(broadcastEvent);

const server = createServer((req, res) => {
  handleRoute(req, res);
});

const wsServer = new WebSocketServer({ noServer: true });

wsServer.on("connection", (socket) => {
  wsClients.add(socket);

  const recentEvents = getRecentEvents(200).map(rowToJson);
  socket.send(JSON.stringify({ type: "bootstrap", events: recentEvents }));

  socket.on("close", () => {
    wsClients.delete(socket);
  });
});

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(req, socket, head, (client) => {
    wsServer.emit("connection", client, req);
  });
});

function shutdown(): void {
  console.log("[agentglass-daemon] shutting down…");
  closeDb();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, host, () => {
  console.log(`[agentglass-daemon] listening at http://${host}:${port}`);
  console.log(`[agentglass-daemon] websocket endpoint ws://${host}:${port}/ws`);
  console.log(`[agentglass-daemon] SQLite store: ${dbPath}`);
});
import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from rich.json import JSON
from rich.syntax import Syntax
from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, VerticalScroll, Vertical
from textual.widgets import Header, Footer, ListView, ListItem, Static, Label
from textual.worker import Worker, WorkerState
from textual import work

import websockets

logging.basicConfig(level=logging.INFO, filename="tui_debug.log")

class NodeItem(ListItem):
    def __init__(self, span_id: str, label: str, status: str, indent: int = 0):
        super().__init__()
        self.span_id = span_id
        self._label = label
        self.status = status
        self.indent = indent

    def compose(self) -> ComposeResult:
        color = "green" if self.status == "success" else "red" if self.status == "error" else "yellow"
        prefix = "  " * self.indent + "└─ " if self.indent > 0 else ""
        yield Label(f"[{color}]{prefix}{self._label}[/{color}]", classes="node-label")


class EventItem(ListItem):
    def __init__(self, event: dict[str, Any]):
        super().__init__()
        self.event = event

    def compose(self) -> ComposeResult:
        ev_type = self.event.get("event_type", "unknown")
        time_ms = self.event.get("timestamp", 0) / 1000
        color = "cyan"
        if ev_type == "error":
            color = "red"
        elif ev_type == "tool_call":
            color = "magenta"
        elif ev_type == "llm_response":
            color = "green"
        yield Label(f"[{color}]{ev_type}[/{color}] - {self.event.get('node_name', '')}")


class AgentGlassTUI(App):
    CSS = """
    #left-pane {
        width: 30%;
        border-right: solid #1e293b;
        background: #0f172a;
    }
    #right-pane {
        width: 70%;
        background: #0f172a;
    }
    #top-right {
        height: 50%;
        border-bottom: solid #1e293b;
    }
    #bottom-right {
        height: 50%;
    }
    ListView {
        background: transparent;
    }
    ListView > ListItem {
        padding: 0 1;
    }
    ListView > ListItem.--highlight {
        background: #1e293b;
    }
    .panel-title {
        background: #334155;
        color: white;
        padding: 0 1;
        text-style: bold;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", show=True),
        Binding("tab", "switch_pane", "Switch Pane", show=True),
        Binding("f", "fork", "Fork", show=True),
        Binding("i", "inject", "Inject", show=True),
        Binding("r", "rca", "Request RCA", show=True),
    ]

    def __init__(self, daemon_url: str):
        super().__init__()
        self.daemon_ws_url = daemon_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
        self.events: list[dict[str, Any]] = []
        self.nodes: dict[str, dict[str, Any]] = {}
        self.spans: set[str] = set()

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal():
            with Vertical(id="left-pane"):
                yield Static("Agent Graph", classes="panel-title")
                yield ListView(id="node-list")
            with Vertical(id="right-pane"):
                with Vertical(id="top-right"):
                    yield Static("Event Timeline", classes="panel-title")
                    yield ListView(id="event-list")
                with VerticalScroll(id="bottom-right"):
                    yield Static("Payload Inspector", classes="panel-title")
                    yield Static("", id="payload-view")
        yield Footer()

    def on_mount(self) -> None:
        self.title = "AgentGlass TUI"
        self.listen_to_daemon()

    @work(exclusive=True, thread=True)
    def listen_to_daemon(self) -> None:
        asyncio.run(self._ws_loop())

    async def _ws_loop(self) -> None:
        try:
            async with websockets.connect(self.daemon_ws_url) as ws:
                self.call_from_thread(self.notify, f"Connected to {self.daemon_ws_url}")
                async for message in ws:
                    try:
                        data = json.loads(message)
                        self.call_from_thread(self.handle_ws_message, data)
                    except Exception as e:
                        logging.error(f"Error parsing message: {e}")
        except Exception as e:
            self.call_from_thread(self.notify, f"WebSocket error: {e}", severity="error")

    def handle_ws_message(self, data: dict[str, Any]) -> None:
        msg_type = data.get("type")
        if msg_type == "bootstrap":
            for ev in data.get("events", []):
                self.add_event(ev)
        elif msg_type == "event":
            self.add_event(data.get("event", {}))
        self.update_ui()

    def add_event(self, ev: dict[str, Any]) -> None:
        self.events.append(ev)
        span_id = ev.get("span_id")
        if not span_id:
            return

        if span_id not in self.nodes:
            self.nodes[span_id] = {
                "id": span_id,
                "name": ev.get("node_name", "unknown"),
                "status": "running",
                "events": [],
                "parent": ev.get("parent_span_id")
            }
            self.spans.add(span_id)

        node = self.nodes[span_id]
        node["events"].append(ev)
        
        if not node["name"] and ev.get("node_name"):
            node["name"] = ev["node_name"]

        ev_type = ev.get("event_type")
        if ev_type == "error":
            node["status"] = "error"
        elif ev_type == "agent_end" and node["status"] != "error":
            node["status"] = "success"

    def update_ui(self) -> None:
        node_list = self.query_one("#node-list", ListView)
        # Keep selection if possible
        current_idx = node_list.index
        
        # Rebuild tree visually
        node_list.clear()
        
        # Super naive tree sorting
        roots = [n for n in self.nodes.values() if not n["parent"] or n["parent"] not in self.nodes]
        
        def add_node_rec(n: dict, depth: int):
            node_list.append(NodeItem(n["id"], n["name"] or "unnamed", n["status"], depth))
            children = [child for child in self.nodes.values() if child["parent"] == n["id"]]
            for child in children:
                add_node_rec(child, depth + 1)
                
        for root in roots:
            add_node_rec(root, 0)
            
        if current_idx is not None and current_idx < len(node_list):
            node_list.index = current_idx

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        pass # Handle selection explicitly in highlighted instead for instant update

    def on_list_view_highlighted(self, event: ListView.Highlighted) -> None:
        if event.item is None:
            return
            
        if isinstance(event.item, NodeItem):
            self.show_node_events(event.item.span_id)
        elif isinstance(event.item, EventItem):
            self.show_payload(event.item.event)

    def show_node_events(self, span_id: str) -> None:
        event_list = self.query_one("#event-list", ListView)
        event_list.clear()
        
        node = self.nodes.get(span_id)
        if not node:
            return
            
        for ev in node["events"]:
            event_list.append(EventItem(ev))
            
        if event_list.children:
            event_list.index = 0
            self.show_payload(node["events"][0])

    def show_payload(self, event: dict[str, Any]) -> None:
        payload_view = self.query_one("#payload-view", Static)
        payload = event.get("payload", {})
        
        if isinstance(payload, dict) and "$blob" in payload:
            # Tell the user it's a blob
            text = f"Payload stored in blob {payload['$blob']}\n\nUse Dashboard to resolve, or curl daemon /v1/blobs/{payload['$blob']}"
            payload_view.update(text)
        else:
            json_str = json.dumps(payload, indent=2)
            payload_view.update(Syntax(json_str, "json", theme="monokai", word_wrap=True))

    def action_switch_pane(self) -> None:
        active = self.focused
        node_list = self.query_one("#node-list")
        event_list = self.query_one("#event-list")
        
        if active == node_list:
            event_list.focus()
        else:
            node_list.focus()

    def action_fork(self) -> None:
        self.notify("Forking is implemented in the Web Dashboard.", title="Not Supported", severity="warning")

    def action_inject(self) -> None:
        self.notify("State injection requires God Mode or Web Dashboard.", title="Not Supported", severity="warning")

    def action_rca(self) -> None:
        node_list = self.query_one("#node-list", ListView)
        if node_list.highlighted_child and isinstance(node_list.highlighted_child, NodeItem):
            item = node_list.highlighted_child
            if item.status == "error":
                self.notify("RCA requested! Check daemon logs or dashboard.", title="AutoRCA")
            else:
                self.notify("Can only run RCA on error nodes.", title="Invalid Node", severity="error")


def run_tui(daemon_url: str):
    app = AgentGlassTUI(daemon_url)
    app.run()

from __future__ import annotations

import webbrowser

import typer


app = typer.Typer(help="AgentGlass Python SDK scaffold commands")


@app.command()
def up(
    open_browser: bool = typer.Option(True, help="Open dashboard URL in browser"),
    dashboard_url: str = typer.Option("http://localhost:3000", help="Dashboard URL"),
    daemon_url: str = typer.Option("http://127.0.0.1:7777", help="Daemon URL"),
) -> None:
    typer.echo("AgentGlass scaffold is installed.")
    typer.echo("Run the local stack from repository root:")
    typer.echo("  pnpm dev:daemon")
    typer.echo("  pnpm dev:dashboard")
    typer.echo("or")
    typer.echo("  pnpm dev:up")
    typer.echo(f"Dashboard target: {dashboard_url}")
    typer.echo(f"Daemon target: {daemon_url}")

    if open_browser:
        webbrowser.open(dashboard_url)

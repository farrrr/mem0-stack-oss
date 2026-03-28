#!/usr/bin/env python3
"""
rebuild_memories.py - Export conversations and re-import through POST /add
to rebuild all memories with updated extraction prompt, taxonomy, and graph.

Usage:
    python scripts/rebuild_memories.py export
    python scripts/rebuild_memories.py import --limit 300
    python scripts/rebuild_memories.py import
    python scripts/rebuild_memories.py import --retry-failed
    python scripts/rebuild_memories.py status
    python scripts/rebuild_memories.py verify
"""

import argparse
import hashlib
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
import redis
import requests

# ---------------------------------------------------------------------------
# Paths (absolute so the script works from any directory)
# ---------------------------------------------------------------------------
ENV_PATH = Path("/opt/mem0-stack/server/.env")
SCRIPT_DIR = Path("/data/services/mem0-workspace/mem0-stack-oss/scripts")
DATA_DIR = SCRIPT_DIR / "data"
CONVERSATIONS_PATH = DATA_DIR / "conversations.jsonl"
STATE_PATH = DATA_DIR / "rebuild_state.json"

API_BASE = "http://localhost:8090"
HTTP_TIMEOUT = 120
RATE_LIMIT_WAIT = 30
MAX_RETRIES = 3
STATE_SAVE_INTERVAL = 10


# ---------------------------------------------------------------------------
# Env parser
# ---------------------------------------------------------------------------
def load_env(path: Path) -> dict[str, str]:
    """Parse a .env file (key=value, skip comments and blanks)."""
    env: dict[str, str] = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            # Strip optional surrounding quotes
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            env[key] = value
    return env


def get_env() -> dict[str, str]:
    if not ENV_PATH.exists():
        print(f"ERROR: env file not found at {ENV_PATH}", file=sys.stderr)
        sys.exit(1)
    return load_env(ENV_PATH)


# ---------------------------------------------------------------------------
# PostgreSQL helper
# ---------------------------------------------------------------------------
def pg_connect(env: dict[str, str]):
    """Return a psycopg2 connection from env vars."""
    return psycopg2.connect(
        host=env.get("POSTGRES_HOST", "localhost"),
        port=int(env.get("POSTGRES_PORT", "5432")),
        dbname=env.get("POSTGRES_DB", "mem0"),
        user=env.get("POSTGRES_USER", "mem0"),
        password=env.get("POSTGRES_PASSWORD", ""),
    )


# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------
def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {
        "total": 0,
        "completed_hashes": [],
        "failed": [],
        "started_at": None,
        "last_updated": None,
    }


def save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    state["last_updated"] = datetime.now(timezone.utc).isoformat()
    tmp = STATE_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    tmp.rename(STATE_PATH)


# ---------------------------------------------------------------------------
# Progress display
# ---------------------------------------------------------------------------
def format_duration(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h{m:02d}m{s:02d}s"
    return f"{m}m{s:02d}s"


def print_progress(current: int, total: int, elapsed: float, ok: int, fail: int) -> None:
    pct = (current / total * 100) if total else 0
    if current > 0:
        rate = elapsed / current
        remaining = rate * (total - current)
        eta = format_duration(remaining)
    else:
        eta = "?"
    line = (
        f"\r[{current}/{total}] {pct:.1f}% | "
        f"T {format_duration(elapsed)} elapsed | "
        f"OK {ok} ok | "
        f"FAIL {fail} fail | "
        f"~{eta} remaining"
    )
    sys.stdout.write(line.ljust(100))
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# HTTP caller with retries
# ---------------------------------------------------------------------------
def post_add(
    messages: list,
    api_key: str,
    created_at: str | None = None,
    agent_id: str | None = None,
    app_id: str | None = None,
    run_id: str | None = None,
) -> dict:
    """POST /memories with retry logic. Returns response JSON or raises."""
    url = f"{API_BASE}/memories"
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
    payload: dict = {
        "messages": messages,
        "user_id": "far",
    }
    if agent_id:
        payload["agent_id"] = agent_id
    if run_id:
        payload["run_id"] = run_id

    metadata: dict = {}
    if app_id:
        metadata["app_id"] = app_id
    if created_at:
        metadata["created_at"] = created_at
    if metadata:
        payload["metadata"] = metadata

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=HTTP_TIMEOUT)

            if resp.status_code == 429:
                if attempt < MAX_RETRIES:
                    print(f"\n  429 rate-limited, waiting {RATE_LIMIT_WAIT}s (attempt {attempt}/{MAX_RETRIES})")
                    time.sleep(RATE_LIMIT_WAIT)
                    continue
                resp.raise_for_status()

            if resp.status_code >= 500:
                raise requests.exceptions.HTTPError(
                    f"Server error {resp.status_code}: {resp.text[:200]}", response=resp
                )

            resp.raise_for_status()
            return resp.json()

        except requests.exceptions.ConnectionError as e:
            last_err = e
            if attempt < MAX_RETRIES:
                print(f"\n  Connection error, waiting 5s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(5)
                continue
            raise
        except requests.exceptions.HTTPError:
            raise
        except requests.exceptions.Timeout as e:
            last_err = e
            if attempt < MAX_RETRIES:
                print(f"\n  Timeout, waiting 5s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(5)
                continue
            raise

    raise last_err  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_export() -> None:
    """Export unique conversations from memory_sources to JSONL."""
    env = get_env()
    conn = pg_connect(env)

    print("Querying memory_sources for unique conversations...")
    # Use backup DB if available (main DB may be truncated for rebuild)
    backup_db = env.get("POSTGRES_DB", "mem0") + "_backup"
    try:
        conn_backup = psycopg2.connect(
            host=env.get("POSTGRES_HOST", "localhost"),
            port=int(env.get("POSTGRES_PORT", "5432")),
            dbname=backup_db,
            user=env.get("POSTGRES_USER", "mem0"),
            password=env.get("POSTGRES_PASSWORD", ""),
        )
        conn.close()
        conn = conn_backup
        print(f"Using backup database: {backup_db}")
    except Exception:
        print("No backup database found, using main database")

    query = """
        SELECT
            sub.hash,
            sub.messages,
            sub.created_at,
            sub.agent_id,
            sub.app_id,
            sub.run_id
        FROM (
            SELECT DISTINCT ON (md5(ms.messages::text))
                md5(ms.messages::text) AS hash,
                ms.messages,
                ms.created_at,
                mode() WITHIN GROUP (ORDER BY m.payload->>'agent_id') AS agent_id,
                mode() WITHIN GROUP (ORDER BY m.payload->>'app_id') AS app_id,
                mode() WITHIN GROUP (ORDER BY m.payload->>'run_id') AS run_id
            FROM memory_sources ms
            LEFT JOIN memories m ON ms.memory_id = m.id
            GROUP BY md5(ms.messages::text), ms.messages, ms.created_at
            ORDER BY md5(ms.messages::text), ms.created_at
        ) sub
        ORDER BY sub.created_at
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        rows = cur.fetchall()

    conn.close()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    with open(CONVERSATIONS_PATH, "w") as f:
        for row in rows:
            record = {
                "hash": row["hash"],
                "messages": row["messages"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "agent_id": row["agent_id"] or None,
                "app_id": row["app_id"] or None,
                "run_id": row["run_id"] or None,
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1

    print(f"Exported {count} unique conversations to {CONVERSATIONS_PATH}")


def cmd_import(limit: int | None, retry_failed: bool) -> None:
    """Import conversations via POST /add."""
    if not CONVERSATIONS_PATH.exists():
        print(f"ERROR: {CONVERSATIONS_PATH} not found. Run 'export' first.", file=sys.stderr)
        sys.exit(1)

    env = get_env()
    api_key = env.get("ADMIN_API_KEY", "")
    if not api_key:
        print("ERROR: ADMIN_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    # Load conversations
    conversations: list[dict] = []
    with open(CONVERSATIONS_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                conversations.append(json.loads(line))

    state = load_state()
    state["total"] = len(conversations)
    if not state["started_at"]:
        state["started_at"] = datetime.now(timezone.utc).isoformat()

    completed_set: set[str] = set(state["completed_hashes"])
    failed_hashes = {item["hash"] for item in state["failed"]}

    # Determine work queue
    if retry_failed:
        queue = [c for c in conversations if c["hash"] in failed_hashes]
        # Clear failed entries for items we are retrying
        retrying = {c["hash"] for c in queue}
        state["failed"] = [f for f in state["failed"] if f["hash"] not in retrying]
        print(f"Retrying {len(queue)} previously failed conversations")
    else:
        queue = [c for c in conversations if c["hash"] not in completed_set]
        print(f"Found {len(queue)} unprocessed conversations (of {len(conversations)} total)")

    if limit is not None:
        queue = queue[:limit]
        print(f"Processing first {len(queue)} (--limit {limit})")

    if not queue:
        print("Nothing to process.")
        return

    total_to_process = len(queue)
    ok_count = 0
    fail_count = 0
    start_time = time.monotonic()
    unsaved_count = 0

    # Graceful shutdown on Ctrl+C
    interrupted = False

    def sigint_handler(sig, frame):
        nonlocal interrupted
        interrupted = True
        print("\n\nInterrupted! Saving state...")

    original_handler = signal.getsignal(signal.SIGINT)
    signal.signal(signal.SIGINT, sigint_handler)

    try:
        for i, conv in enumerate(queue, 1):
            if interrupted:
                break

            h = conv["hash"]
            messages = conv["messages"]

            try:
                post_add(
                    messages, api_key,
                    created_at=conv.get("created_at"),
                    agent_id=conv.get("agent_id"),
                    app_id=conv.get("app_id"),
                    run_id=conv.get("run_id"),
                )
                if h not in completed_set:
                    state["completed_hashes"].append(h)
                    completed_set.add(h)
                ok_count += 1
            except Exception as e:
                err_msg = str(e)[:300]
                # Check if already in failed list
                existing = [f for f in state["failed"] if f["hash"] == h]
                if existing:
                    existing[0]["error"] = err_msg
                    existing[0]["attempt"] = existing[0].get("attempt", 0) + 1
                else:
                    state["failed"].append({"hash": h, "error": err_msg, "attempt": 1})
                fail_count += 1

            unsaved_count += 1
            elapsed = time.monotonic() - start_time
            print_progress(i, total_to_process, elapsed, ok_count, fail_count)

            # Save state periodically
            if unsaved_count >= STATE_SAVE_INTERVAL:
                save_state(state)
                unsaved_count = 0

    finally:
        # Always save state at the end
        save_state(state)
        signal.signal(signal.SIGINT, original_handler)

    elapsed = time.monotonic() - start_time
    print(f"\n\nDone. {ok_count} succeeded, {fail_count} failed in {format_duration(elapsed)}")
    print(f"Total completed: {len(state['completed_hashes'])}/{state['total']}")
    if state["failed"]:
        print(f"Failed: {len(state['failed'])} (use --retry-failed to retry)")


def cmd_status() -> None:
    """Print current progress from state file."""
    if not STATE_PATH.exists():
        print("No state file found. Run 'import' first.")
        return

    state = load_state()
    total = state["total"]
    done = len(state["completed_hashes"])
    failed = len(state["failed"])
    remaining = max(0, total - done - failed)

    print(f"Total conversations: {total}")
    print(f"Completed:           {done}")
    print(f"Failed:              {failed}")
    print(f"Remaining:           {remaining}")
    print(f"Progress:            {done / total * 100:.1f}%" if total else "Progress: N/A")
    print(f"Started:             {state.get('started_at', 'N/A')}")
    print(f"Last updated:        {state.get('last_updated', 'N/A')}")

    if state["failed"]:
        print(f"\nRecent failures (last 5):")
        for item in state["failed"][-5:]:
            print(f"  hash={item['hash'][:12]}... attempt={item.get('attempt', '?')} error={item['error'][:80]}")


def cmd_verify() -> None:
    """Compare old vs new memory stats."""
    env = get_env()

    # PostgreSQL stats
    conn = pg_connect(env)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM memories WHERE payload->>'user_id' = 'far'")
        total_memories = cur.fetchone()[0]

        cur.execute(
            "SELECT cat, count(*) AS cnt FROM ("
            "  SELECT jsonb_array_elements_text("
            "    CASE jsonb_typeof(payload->'metadata'->'category')"
            "      WHEN 'array' THEN payload->'metadata'->'category'"
            "      WHEN 'string' THEN jsonb_build_array(payload->'metadata'->>'category')"
            "      ELSE '[]'::jsonb END"
            "  ) AS cat FROM memories WHERE payload->>'user_id' = 'far'"
            ") sub GROUP BY cat ORDER BY cnt DESC"
        )
        categories = cur.fetchall()

        # Count original unique conversations
        cur.execute("SELECT count(DISTINCT md5(messages::text)) FROM memory_sources")
        source_count = cur.fetchone()[0]

    conn.close()

    # FalkorDB stats
    try:
        r = redis.Redis(
            host=env.get("FALKORDB_HOST", "localhost"),
            port=int(env.get("FALKORDB_PORT", "6379")),
            password=env.get("FALKORDB_PASSWORD", None),
        )
        result = r.execute_command("GRAPH.QUERY", "mem0_graph", "MATCH (n) RETURN count(n)")
        # Result format: [[header], [[count]], [stats]]
        graph_nodes = result[1][0][0] if result and len(result) > 1 else "?"
        r.close()
    except Exception as e:
        graph_nodes = f"error: {e}"

    # State stats
    state = load_state() if STATE_PATH.exists() else None

    print("=" * 60)
    print("MEMORY REBUILD VERIFICATION")
    print("=" * 60)
    print(f"\nSource conversations:  {source_count}")
    if state:
        print(f"Imported:              {len(state['completed_hashes'])}/{state['total']}")
        print(f"Failed:                {len(state['failed'])}")
    print(f"\nTotal memories (far):  {total_memories}")
    print(f"FalkorDB nodes:        {graph_nodes}")
    print(f"\nCategory distribution:")
    print(f"  {'Category':<30} {'Count':>6}")
    print(f"  {'-' * 30} {'-' * 6}")
    for cat, cnt in categories:
        label = cat if cat else "(none)"
        print(f"  {label:<30} {cnt:>6}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild mem0 memories by re-importing conversations through POST /add"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("export", help="Export conversations from memory_sources to JSONL")

    import_parser = sub.add_parser("import", help="Import conversations via POST /add")
    import_parser.add_argument("--limit", type=int, default=None, help="Max conversations to process")
    import_parser.add_argument("--retry-failed", action="store_true", help="Retry only previously failed items")

    sub.add_parser("status", help="Show current import progress")
    sub.add_parser("verify", help="Compare old vs new memory stats")

    args = parser.parse_args()

    if args.command == "export":
        cmd_export()
    elif args.command == "import":
        cmd_import(limit=args.limit, retry_failed=args.retry_failed)
    elif args.command == "status":
        cmd_status()
    elif args.command == "verify":
        cmd_verify()


if __name__ == "__main__":
    main()

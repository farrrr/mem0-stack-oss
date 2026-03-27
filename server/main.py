"""
Mem0 Self-Hosted API Server (Open Source Edition)

Changes from upstream:
- Sync Memory → AsyncMemory (non-blocking I/O)
- Module-level init → FastAPI lifespan (clean startup/shutdown)
- Added /health endpoint
"""
import asyncio
import json
import logging
import math
import os
import secrets
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psycopg2
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

load_dotenv()

# --- Auth ---
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
MIN_KEY_LENGTH = 16

if not ADMIN_API_KEY:
    logger.warning(
        "ADMIN_API_KEY not set - API endpoints are UNSECURED! "
        "Set ADMIN_API_KEY environment variable for production use."
    )
else:
    if len(ADMIN_API_KEY) < MIN_KEY_LENGTH:
        logger.warning(
            "ADMIN_API_KEY is shorter than %d characters - consider using a longer key for production.",
            MIN_KEY_LENGTH,
        )
    logger.info("API key authentication enabled")

MAINTENANCE_API_KEY = os.environ.get("MAINTENANCE_API_KEY", "")

# --- Config from env ---
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "postgres")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_COLLECTION_NAME = os.environ.get("POSTGRES_COLLECTION_NAME", "memories")

# --- Graph store ---
GRAPH_PROVIDER = os.environ.get("GRAPH_PROVIDER", "falkordb")
FALKORDB_HOST = os.environ.get("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.environ.get("FALKORDB_PORT", "6379"))
FALKORDB_DATABASE = os.environ.get("FALKORDB_DATABASE", "mem0")
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USERNAME = os.environ.get("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "mem0graph")

# --- LLM ---
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4.1-nano-2025-04-14")
LLM_API_KEY = os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0.2"))
LLM_MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "8192"))

# --- Embedder ---
EMBEDDER_PROVIDER = os.environ.get("EMBEDDER_PROVIDER", "openai")
EMBEDDER_MODEL = os.environ.get("EMBEDDER_MODEL", "text-embedding-3-small")
EMBEDDER_DIMS = int(os.environ.get("EMBEDDER_DIMS", "1536"))
EMBEDDER_API_KEY = os.environ.get("EMBEDDER_API_KEY", os.environ.get("OPENAI_API_KEY", ""))

# --- Reranker (optional) ---
RERANKER_PROVIDER = os.environ.get("RERANKER_PROVIDER", "")
RERANKER_MODEL = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
RERANKER_DEVICE = os.environ.get("RERANKER_DEVICE", "cpu")
RERANKER_TOP_K = int(os.environ.get("RERANKER_TOP_K", "5"))

# --- Graph LLM (optional, falls back to main LLM) ---
GRAPH_LLM_PROVIDER = os.environ.get("GRAPH_LLM_PROVIDER", LLM_PROVIDER)
GRAPH_LLM_MODEL = os.environ.get("GRAPH_LLM_MODEL", LLM_MODEL)
GRAPH_LLM_API_KEY = os.environ.get("GRAPH_LLM_API_KEY", LLM_API_KEY)
GRAPH_LLM_BASE_URL = os.environ.get("GRAPH_LLM_BASE_URL", LLM_BASE_URL)

# --- Fallback LLM (optional) ---
FALLBACK_LLM_MODEL = os.environ.get("FALLBACK_LLM_MODEL", "")
FALLBACK_LLM_API_KEY = os.environ.get("FALLBACK_LLM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))

HISTORY_DB_PATH = os.environ.get("HISTORY_DB_PATH", "/app/history/history.db")

if not LLM_API_KEY:
    logger.warning("LLM_API_KEY (or OPENAI_API_KEY) not set - LLM calls will fail.")
if not EMBEDDER_API_KEY:
    logger.warning("EMBEDDER_API_KEY (or OPENAI_API_KEY) not set - embedding calls will fail.")

PG_POOL_MIN = int(os.environ.get("PG_POOL_MIN", "2"))
PG_POOL_MAX = int(os.environ.get("PG_POOL_MAX", "80"))

# --- Custom fact extraction prompt ---
CUSTOM_PROMPT_PATH = os.environ.get(
    "CUSTOM_PROMPT_PATH",
    os.path.join(os.path.dirname(__file__), "prompts", "extraction.txt"),
)
_EXTRACTION_TEMPLATE = ""
_is_custom_prompt_path = "CUSTOM_PROMPT_PATH" in os.environ
if os.path.exists(CUSTOM_PROMPT_PATH):
    with open(CUSTOM_PROMPT_PATH) as _f:
        _EXTRACTION_TEMPLATE = _f.read().strip()
    logger.info("Custom extraction prompt loaded from %s", CUSTOM_PROMPT_PATH)
elif _is_custom_prompt_path:
    logger.warning("CUSTOM_PROMPT_PATH set to %s but file not found", CUSTOM_PROMPT_PATH)

# --- Classification pipeline config ---
CLASSIFY_ENABLED = os.environ.get("CLASSIFY_ENABLED", "true").lower() == "true"
CLASSIFY_MODEL = os.environ.get("CLASSIFY_MODEL", LLM_MODEL)
CLASSIFY_API_KEY = os.environ.get("CLASSIFY_API_KEY", LLM_API_KEY)
CLASSIFY_BASE_URL = os.environ.get("CLASSIFY_BASE_URL", LLM_BASE_URL)

VERIFY_ENABLED = os.environ.get("VERIFY_ENABLED", "false").lower() == "true"
VERIFY_MODEL = os.environ.get("VERIFY_MODEL", "")
VERIFY_API_KEY = os.environ.get("VERIFY_API_KEY", "")
VERIFY_PROVIDER = os.environ.get("VERIFY_PROVIDER", "openai")

# Load taxonomy and classification prompt
_TAXONOMY_PATH = os.path.join(os.path.dirname(__file__), "prompts", "taxonomy.json")
_CLASSIFY_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "prompts", "classification.txt")
_TAXONOMY = {}
_TAXONOMY_PROMPT = ""
_CLASSIFY_PROMPT_TEMPLATE = ""

if os.path.exists(_TAXONOMY_PATH):
    with open(_TAXONOMY_PATH) as _f:
        _TAXONOMY = json.load(_f)

    # Build flat prompt string for LLM
    lines = ["OFFICIAL CATEGORIES (pick exactly one):"]
    lines.append(", ".join(_TAXONOMY.get("categories", [])))
    lines.append("")
    lines.append("SUBCATEGORIES per category (key: description):")
    for cat, subs in _TAXONOMY.get("subcategories", {}).items():
        if subs:
            sub_str = ", ".join(f"{k} ({v})" for k, v in subs.items())
            lines.append(f"  {cat}: {sub_str}")
    _TAXONOMY_PROMPT = "\n".join(lines)

if os.path.exists(_CLASSIFY_PROMPT_PATH):
    with open(_CLASSIFY_PROMPT_PATH) as _f:
        _CLASSIFY_PROMPT_TEMPLATE = _f.read().strip()

# Lazy singleton for classification LLM client
_classify_client = None


def _get_classify_client():
    """Lazy singleton for the OpenAI-compatible client used for classification."""
    global _classify_client
    if _classify_client is None:
        from openai import OpenAI
        kwargs = {"api_key": CLASSIFY_API_KEY}
        if CLASSIFY_BASE_URL:
            kwargs["base_url"] = CLASSIFY_BASE_URL
        _classify_client = OpenAI(**kwargs)
    return _classify_client


# --- Direct PG connection (for metadata operations outside SDK) ---
@contextmanager
def get_pg_conn():
    """Create a fresh PG connection with auto-commit on success, rollback on error."""
    conn = psycopg2.connect(
        dbname=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST, port=int(POSTGRES_PORT),
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _build_graph_config() -> dict:
    """Build graph store config based on GRAPH_PROVIDER."""
    if GRAPH_PROVIDER == "falkordb":
        config = {
            "provider": "falkordb",
            "config": {
                "host": FALKORDB_HOST,
                "port": FALKORDB_PORT,
                "database": FALKORDB_DATABASE,
            },
        }
    else:
        config = {
            "provider": "neo4j",
            "config": {"url": NEO4J_URI, "username": NEO4J_USERNAME, "password": NEO4J_PASSWORD},
        }

    # Graph-specific LLM
    llm_config = {
        "model": GRAPH_LLM_MODEL,
        "api_key": GRAPH_LLM_API_KEY,
        "temperature": 0,
        "max_tokens": 4096,
    }
    if GRAPH_LLM_BASE_URL:
        llm_config["openai_base_url"] = GRAPH_LLM_BASE_URL
    config["llm"] = {"provider": GRAPH_LLM_PROVIDER, "config": llm_config}

    # Fallback LLM for graph
    if FALLBACK_LLM_MODEL and FALLBACK_LLM_API_KEY:
        config["fallback_llm"] = {
            "provider": "openai",
            "config": {
                "model": FALLBACK_LLM_MODEL,
                "api_key": FALLBACK_LLM_API_KEY,
                "temperature": 0,
                "max_tokens": 4096,
            },
        }

    return config


def _build_config() -> dict:
    """Build mem0 configuration from environment variables."""
    llm_config = {
        "api_key": LLM_API_KEY,
        "temperature": LLM_TEMPERATURE,
        "model": LLM_MODEL,
        "max_tokens": LLM_MAX_TOKENS,
    }
    if LLM_BASE_URL:
        llm_config["openai_base_url"] = LLM_BASE_URL

    config = {
        "version": "v1.1",
        "vector_store": {
            "provider": "pgvector",
            "config": {
                "host": POSTGRES_HOST,
                "port": int(POSTGRES_PORT),
                "dbname": POSTGRES_DB,
                "user": POSTGRES_USER,
                "password": POSTGRES_PASSWORD,
                "collection_name": POSTGRES_COLLECTION_NAME,
                "embedding_model_dims": EMBEDDER_DIMS,
                "minconn": PG_POOL_MIN,
                "maxconn": PG_POOL_MAX,
            },
        },
        "graph_store": _build_graph_config(),
        "llm": {"provider": LLM_PROVIDER, "config": llm_config},
        "embedder": {
            "provider": EMBEDDER_PROVIDER,
            "config": {
                "model": EMBEDDER_MODEL,
                "embedding_dims": EMBEDDER_DIMS,
                "api_key": EMBEDDER_API_KEY,
            },
        },
        "history_db_path": HISTORY_DB_PATH,
    }

    # Reranker (optional)
    if RERANKER_PROVIDER:
        config["reranker"] = {
            "provider": RERANKER_PROVIDER,
            "config": {
                "model": RERANKER_MODEL,
                "device": RERANKER_DEVICE,
                "top_k": RERANKER_TOP_K,
            },
        }

    # Top-level fallback LLM
    if FALLBACK_LLM_MODEL and FALLBACK_LLM_API_KEY:
        config["fallback_llm"] = {
            "provider": "openai",
            "config": {
                "model": FALLBACK_LLM_MODEL,
                "api_key": FALLBACK_LLM_API_KEY,
                "temperature": 0,
                "max_tokens": 4096,
            },
        }

    # Custom extraction prompt — {date} placeholder is replaced by SDK on each add() call
    if _EXTRACTION_TEMPLATE:
        config["custom_fact_extraction_prompt"] = _EXTRACTION_TEMPLATE

    return config


# --- Memory metadata ---
def init_memory_metadata(memory_id: str, ttl_days: Optional[int] = None):
    """Set initial importance_score and last_accessed_at for a new memory."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        meta: Dict[str, Any] = {"importance_score": 1.0, "last_accessed_at": now_iso}
        if ttl_days is not None and ttl_days > 0:
            from datetime import timedelta
            meta["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=ttl_days)).isoformat()
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE memories SET payload = jsonb_set(
                        COALESCE(payload, '{}'), '{metadata}',
                        COALESCE(payload->'metadata', '{}') || %s::jsonb
                    ) WHERE id = %s""",
                    (json.dumps(meta), memory_id),
                )
        logger.info("INIT_META ok for %s", memory_id)
    except Exception as e:
        logger.warning("INIT_META failed for %s: %s", memory_id, e)


def update_last_accessed(memory_ids: List[str]):
    """Batch update last_accessed_at for memories hit by a search."""
    if not memory_ids:
        return
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        meta_patch = json.dumps({"last_accessed_at": now_iso})
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE memories SET payload = jsonb_set(
                        COALESCE(payload, '{}'), '{metadata}',
                        COALESCE(payload->'metadata', '{}') || %s::jsonb
                    ) WHERE id::text = ANY(%s)""",
                    (meta_patch, memory_ids),
                )
        logger.info("LAST_ACCESS updated for %d memories", len(memory_ids))
    except Exception as e:
        logger.warning("LAST_ACCESS update failed: %s", e)


def save_memory_source(memory_id: str, messages: list):
    """Store original conversation messages that produced a memory."""
    try:
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO memory_sources (memory_id, messages) VALUES (%s, %s)",
                    (memory_id, json.dumps(messages, ensure_ascii=False)),
                )
    except Exception as e:
        logger.warning("Source store failed for %s: %s", memory_id, e)


# --- Request logging ---
def log_request(
    request_type: str, user_id: str, run_id: Optional[str],
    latency_ms: int, status_code: int, has_results: bool,
    event_summary: dict, req_payload: dict,
    memory_actions: Optional[dict] = None,
    retrieved_memories: Optional[list] = None,
    error_msg: Optional[str] = None,
):
    """Fire-and-forget: log an API request to api_requests table."""
    try:
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO api_requests
                    (request_type, user_id, run_id, latency_ms, status_code, has_results,
                     event_summary, req_payload, memory_actions, retrieved_memories, error_msg)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    request_type, user_id, run_id, latency_ms, status_code, has_results,
                    json.dumps(event_summary, ensure_ascii=False),
                    json.dumps(req_payload, ensure_ascii=False),
                    json.dumps(memory_actions, ensure_ascii=False) if memory_actions else None,
                    json.dumps(retrieved_memories, ensure_ascii=False) if retrieved_memories else None,
                    error_msg,
                ))
    except Exception as e:
        logger.warning("log_request failed: %s", e)


# --- Classification pipeline ---
def _strip_markdown_fences(raw: str) -> str:
    """Remove markdown code fences from LLM output."""
    import re
    return re.sub(r"^```\w*\n?", "", re.sub(r"\n?```\s*$", "", raw)).strip()


async def classify_memory(memory_text: str) -> dict:
    """Classify a single memory using an OpenAI-compatible LLM."""
    if not CLASSIFY_ENABLED or not _CLASSIFY_PROMPT_TEMPLATE:
        return {}
    try:
        client = _get_classify_client()
        prompt = _CLASSIFY_PROMPT_TEMPLATE.format(
            taxonomy=_TAXONOMY_PROMPT,
            memory_text=memory_text,
        )
        response = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=CLASSIFY_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=512,
            ),
        )
        raw = _strip_markdown_fences(response.choices[0].message.content.strip())
        result = json.loads(raw)
        result["classified_by"] = CLASSIFY_MODEL
        logger.info(
            "CLASSIFY ok: category=%s tags=%s",
            result.get("category"), result.get("tags"),
        )
        return result
    except Exception as e:
        logger.warning("CLASSIFY failed: %s", e)
        return {}


async def verify_classification(memory_text: str, classification: dict) -> dict:
    """Optionally verify classification with a second LLM."""
    if not VERIFY_ENABLED or not VERIFY_MODEL or not VERIFY_API_KEY:
        return {}
    try:
        if VERIFY_PROVIDER == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=VERIFY_API_KEY)
            prompt = (
                f"You are a classification verifier. A memory was classified by another AI model.\n\n"
                f"Memory: {memory_text}\n\n"
                f"Classification:\n"
                f"- Category: {classification.get('category', '')}\n"
                f"- Subcategory: {classification.get('subcategory', [])}\n"
                f"- Tags: {classification.get('tags', [])}\n\n"
                f"Rate the classification confidence:\n"
                f"- high: category is clearly correct, subcategory fits well, tags are relevant\n"
                f"- medium: category is right but subcategory is debatable\n"
                f"- low: category seems wrong\n\n"
                f'Return ONLY valid JSON: {{"confidence": "high"|"medium"|"low", "reasoning": "..."}}'
            )
            response = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: client.messages.create(
                    model=VERIFY_MODEL,
                    max_tokens=128,
                    messages=[{"role": "user", "content": prompt}],
                ),
            )
            raw = _strip_markdown_fences(response.content[0].text.strip())
        else:
            from openai import OpenAI
            client = OpenAI(api_key=VERIFY_API_KEY)
            prompt = (
                f"Verify this memory classification. Memory: {memory_text}\n"
                f"Category: {classification.get('category')}, Tags: {classification.get('tags')}\n"
                f'Return JSON: {{"confidence": "high"|"medium"|"low", "reasoning": "..."}}'
            )
            response = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: client.chat.completions.create(
                    model=VERIFY_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0,
                    max_tokens=128,
                ),
            )
            raw = _strip_markdown_fences(response.choices[0].message.content.strip())

        result = json.loads(raw)
        result["verified_by"] = f"{VERIFY_PROVIDER}/{VERIFY_MODEL}"
        logger.info("VERIFY ok: confidence=%s", result.get("confidence"))
        return result
    except Exception as e:
        logger.warning("VERIFY failed: %s", e)
        return {}


def store_classification(memory_id: str, classification: dict):
    """Write classification result into payload.metadata in PostgreSQL."""
    if not classification:
        return
    try:
        meta = {
            "category": classification.get("category"),
            "subcategory": classification.get("subcategory"),
            "tags": classification.get("tags", []),
            "confidence": classification.get("confidence"),
            "classified_by": classification.get("classified_by"),
            "verified_by": classification.get("verified_by"),
            "classified_at": datetime.now(timezone.utc).isoformat(),
        }
        meta = {k: v for k, v in meta.items() if v is not None}
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE memories
                    SET payload = jsonb_set(
                        COALESCE(payload, '{}'),
                        '{metadata}',
                        COALESCE(payload->'metadata', '{}') || %s::jsonb
                    )
                    WHERE id = %s
                    """,
                    (json.dumps(meta, ensure_ascii=False), memory_id),
                )
        logger.info("CLASSIFY stored for %s", memory_id)
    except Exception as e:
        logger.warning("CLASSIFY store failed for %s: %s", memory_id, e)


async def classify_and_store(memory_id: str, memory_text: str):
    """Background task: classify, optionally verify, then store."""
    try:
        classification = await classify_memory(memory_text)
        if not classification:
            return
        if VERIFY_ENABLED:
            verification = await verify_classification(memory_text, classification)
            if verification:
                classification["confidence"] = verification.get("confidence", classification.get("confidence"))
                classification["verified_by"] = verification.get("verified_by")
        store_classification(memory_id, classification)
    except Exception as e:
        logger.error("classify_and_store error for %s: %s", memory_id, e)


# --- Lifespan ---
mem0_instance = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize AsyncMemory on startup, cleanup on shutdown."""
    global mem0_instance
    from mem0 import AsyncMemory

    logger.info("Initializing AsyncMemory...")
    mem0_instance = await AsyncMemory.from_config(_build_config())
    logger.info("AsyncMemory ready.")

    # Create extension tables for features beyond base SDK
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS api_requests (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    request_type TEXT NOT NULL,
                    user_id TEXT,
                    run_id TEXT,
                    latency_ms INT,
                    status_code INT DEFAULT 200,
                    has_results BOOLEAN DEFAULT FALSE,
                    event_summary JSONB,
                    req_payload JSONB,
                    memory_actions JSONB,
                    retrieved_memories JSONB,
                    error_msg TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_api_requests_created
                    ON api_requests(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_api_requests_type
                    ON api_requests(request_type);

                CREATE TABLE IF NOT EXISTS memory_sources (
                    id SERIAL PRIMARY KEY,
                    memory_id UUID NOT NULL,
                    messages JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_memory_sources_mid
                    ON memory_sources(memory_id);

                CREATE TABLE IF NOT EXISTS memory_feedback (
                    id SERIAL PRIMARY KEY,
                    memory_id UUID NOT NULL,
                    user_id TEXT NOT NULL,
                    feedback TEXT NOT NULL,
                    reason TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_memory_feedback_mid
                    ON memory_feedback(memory_id);
                CREATE INDEX IF NOT EXISTS idx_memory_feedback_uid
                    ON memory_feedback(user_id);
            """)
            # Expression indexes for efficient pagination/filtering on JSONB fields
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_user_id
                    ON memories ((payload->>'user_id'));
                CREATE INDEX IF NOT EXISTS idx_memories_category
                    ON memories ((payload->'metadata'->>'category'))
                    WHERE payload->'metadata'->>'category' IS NOT NULL;
            """)
    logger.info("Extension tables ready.")

    # Pre-initialize classification client to avoid thread-safety issues
    if CLASSIFY_ENABLED and CLASSIFY_API_KEY:
        _get_classify_client()
        logger.info("Classification client ready (model=%s).", CLASSIFY_MODEL)

    yield
    logger.info("Shutting down.")
    mem0_instance = None


# --- App ---
app = FastAPI(
    title="Mem0 REST APIs",
    description=(
        "A REST API for managing and searching memories for your AI Agents and Apps.\n\n"
        "## Authentication\n"
        "When the ADMIN_API_KEY environment variable is set, all endpoints require "
        "the `X-API-Key` header for authentication."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: Optional[str] = Depends(api_key_header)):
    """Validate the API key when ADMIN_API_KEY is configured. No-op otherwise."""
    if ADMIN_API_KEY:
        if api_key is None:
            raise HTTPException(
                status_code=401,
                detail="X-API-Key header is required.",
                headers={"WWW-Authenticate": "ApiKey"},
            )
        if not secrets.compare_digest(api_key, ADMIN_API_KEY):
            raise HTTPException(
                status_code=401,
                detail="Invalid API key.",
                headers={"WWW-Authenticate": "ApiKey"},
            )
    return api_key


def get_mem0():
    """Dependency that ensures mem0_instance is initialized."""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail="Memory instance not initialized.")
    return mem0_instance


async def verify_maintenance_key(x_maintenance_key: Optional[str] = Header(None)):
    """Validate maintenance API key when MAINTENANCE_API_KEY is configured."""
    if MAINTENANCE_API_KEY:
        if not x_maintenance_key or not secrets.compare_digest(x_maintenance_key, MAINTENANCE_API_KEY):
            raise HTTPException(status_code=403, detail="Invalid maintenance API key.")


# --- Models ---
class Message(BaseModel):
    role: str = Field(..., description="Role of the message (user or assistant).")
    content: str = Field(..., description="Message content.")


class MemoryCreate(BaseModel):
    messages: List[Message] = Field(..., description="List of messages to store.")
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    infer: Optional[bool] = Field(None, description="Whether to extract facts from messages. Defaults to True.")
    memory_type: Optional[str] = Field(None, description="Type of memory to store. Only 'procedural_memory' is supported.")
    prompt: Optional[str] = Field(None, description="Custom prompt for procedural memory summarization.")


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query.")
    user_id: Optional[str] = None
    run_id: Optional[str] = None
    agent_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    limit: Optional[int] = Field(None, description="Maximum number of results to return.")
    threshold: Optional[float] = Field(None, description="Minimum similarity score for results.")


class RecallRequest(BaseModel):
    query: str = Field(..., description="Search query.")
    user_id: str = Field(..., description="User ID for long-term memory search.")
    agent_id: Optional[str] = Field(None, description="Agent ID filter.")
    run_id: Optional[str] = Field(None, description="Session/run ID for session memory search.")
    limit: int = Field(6, description="Maximum results to return.", ge=1, le=100)
    threshold: Optional[float] = Field(None, description="Minimum similarity score filter.")
    rerank: bool = Field(True, description="Whether to apply reranker on results.")


class FeedbackRequest(BaseModel):
    user_id: str = Field(..., description="User ID who submitted the feedback.")
    feedback: str = Field(..., description="Feedback type: positive, negative, or very_negative.")
    reason: Optional[str] = Field(None, description="Optional reason for the feedback.")


# --- Endpoints ---
@app.get("/health", summary="Health check")
async def health():
    """Check if the server and memory instance are ready."""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail="Memory instance not initialized.")
    return {"status": "ok"}


@app.post("/configure", summary="Configure Mem0")
async def set_config(config: Dict[str, Any], _api_key: Optional[str] = Depends(verify_api_key)):
    """Set memory configuration at runtime."""
    global mem0_instance
    from mem0 import AsyncMemory

    try:
        new_instance = await AsyncMemory.from_config(config)
    except Exception as e:
        logger.exception("Failed to apply new configuration:")
        raise HTTPException(status_code=400, detail="Invalid configuration. Check server logs for details.")
    mem0_instance = new_instance
    return {"message": "Configuration set successfully"}


@app.post("/memories", summary="Create memories")
async def add_memory(
    memory_create: MemoryCreate,
    background_tasks: BackgroundTasks,
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Store new memories. Triggers background classification if enabled."""
    if not any([memory_create.user_id, memory_create.agent_id, memory_create.run_id]):
        raise HTTPException(status_code=400, detail="At least one identifier (user_id, agent_id, run_id) is required.")

    params = {k: v for k, v in memory_create.model_dump().items() if v is not None and k != "messages"}
    start = time.time()
    try:
        response = await mem0.add(messages=[m.model_dump() for m in memory_create.messages], **params)

        # Post-processing for new/updated memories
        add_results = response.get("results", []) if isinstance(response, dict) else []
        raw_messages = [m.model_dump() for m in memory_create.messages]
        for r in add_results:
            if r.get("event") in ("ADD", "UPDATE") and r.get("id"):
                # Store source conversation
                background_tasks.add_task(save_memory_source, r["id"], raw_messages)
                # Initialize metadata (importance_score, last_accessed_at)
                background_tasks.add_task(init_memory_metadata, r["id"])
                # Schedule classification
                if CLASSIFY_ENABLED:
                    memory_text = r.get("memory") or r.get("new_memory") or ""
                    if memory_text:
                        background_tasks.add_task(classify_and_store, r["id"], memory_text)

        elapsed_ms = int((time.time() - start) * 1000)
        background_tasks.add_task(
            log_request, "ADD", memory_create.user_id or "", memory_create.run_id,
            elapsed_ms, 200, len(add_results) > 0,
            {"count": len(add_results)},
            {"user_id": memory_create.user_id, "agent_id": memory_create.agent_id},
        )
        return JSONResponse(content=response)
    except Exception as e:
        logger.exception("Error in add_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories", summary="Get memories")
async def get_all_memories(
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    limit: int = Query(35, ge=1, le=500),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    confidence: Optional[str] = None,
    date_range: Optional[str] = Query(None, description="Filter: 1d, 7d, or 30d"),
    search: Optional[str] = Query(None, description="Text search (ILIKE)"),
    background_tasks: BackgroundTasks = None,
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Retrieve memories with server-side pagination and filtering."""
    if not any([user_id, agent_id, run_id]):
        raise HTTPException(status_code=400, detail="At least one of user_id, agent_id, or run_id is required.")
    start_t = time.time()
    try:
        conds: list[str] = []
        params: list = []
        if user_id:
            conds.append("payload->>'user_id' = %s")
            params.append(user_id)
        if agent_id:
            conds.append("payload->>'agent_id' = %s")
            params.append(agent_id)
        if run_id:
            conds.append("payload->>'run_id' = %s")
            params.append(run_id)
        if category:
            conds.append("payload->'metadata'->>'category' = %s")
            params.append(category)
        if confidence:
            conds.append("payload->'metadata'->>'confidence' = %s")
            params.append(confidence)
        if date_range in ("1d", "7d", "30d"):
            days = {"1d": 1, "7d": 7, "30d": 30}[date_range]
            conds.append("(payload->>'created_at')::timestamptz >= NOW() - %s::interval")
            params.append(f"{days} days")
        if search:
            conds.append("COALESCE(payload->>'data', payload->>'memory') ILIKE %s ESCAPE '\\'")
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params.append(f"%{escaped}%")

        where = ("WHERE " + " AND ".join(conds)) if conds else ""

        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT COUNT(*) FROM memories {where}", params)
                    total = cur.fetchone()[0]
                    cur.execute(f"""
                        SELECT id::text,
                               COALESCE(payload->>'data', payload->>'memory'),
                               payload->'metadata',
                               payload->>'user_id',
                               payload->>'agent_id',
                               payload->>'run_id',
                               payload->>'created_at',
                               payload->>'updated_at'
                        FROM memories {where}
                        ORDER BY (payload->>'created_at')::timestamptz DESC NULLS LAST
                        LIMIT %s OFFSET %s
                    """, params + [limit, offset])
                    rows = cur.fetchall()
                    return total, rows

        total, rows = await asyncio.to_thread(_query)
        results = [
            {
                "id": r[0],
                "memory": r[1] or "",
                "metadata": json.loads(r[2]) if isinstance(r[2], str) else (r[2] or {}),
                "user_id": r[3] or "",
                "agent_id": r[4] or "",
                "run_id": r[5] or "",
                "created_at": r[6] or "",
                "updated_at": r[7] or "",
            }
            for r in rows
        ]

        elapsed_ms = int((time.time() - start_t) * 1000)
        if background_tasks:
            background_tasks.add_task(
                log_request, "GET_ALL", user_id or "", run_id,
                elapsed_ms, 200, total > 0,
                {"total": total, "returned": len(results), "limit": limit, "offset": offset},
                {"user_id": user_id, "category": category, "search": search},
            )
        return {"memories": results, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.exception("Error in get_all_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{memory_id}", summary="Get a memory")
async def get_memory(memory_id: str, mem0=Depends(get_mem0), _api_key: Optional[str] = Depends(verify_api_key)):
    """Retrieve a specific memory by ID."""
    try:
        return await mem0.get(memory_id)
    except Exception as e:
        logger.exception("Error in get_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", summary="Search memories")
async def search_memories(
    search_req: SearchRequest,
    background_tasks: BackgroundTasks,
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Search for memories based on a query."""
    start = time.time()
    try:
        params = {k: v for k, v in search_req.model_dump().items() if v is not None and k != "query"}
        result = await mem0.search(query=search_req.query, **params)
        elapsed_ms = int((time.time() - start) * 1000)
        hits = result.get("results", result) if isinstance(result, dict) else result
        background_tasks.add_task(
            log_request, "SEARCH", search_req.user_id or "", search_req.run_id,
            elapsed_ms, 200, bool(hits),
            {"hits": len(hits) if isinstance(hits, list) else 0},
            {"query": search_req.query, "user_id": search_req.user_id},
        )
        return result
    except Exception as e:
        logger.exception("Error in search_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search/recall", summary="Combined long-term + session search")
async def search_recall(
    req: RecallRequest,
    background_tasks: BackgroundTasks,
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Bypass SDK for combined vector search: long-term (user_id) UNION session (run_id).

    When run_id is provided, queries both long-term and session memories in a single
    SQL UNION, deduplicates, optionally reranks, and returns merged results.
    Without run_id, behaves like a standard vector search.
    """
    start = time.time()
    try:
        # 1. Embed query once
        embeddings = await asyncio.to_thread(
            mem0.embedding_model.embed, req.query, "search",
        )
        embedding_str = "[" + ",".join(str(x) for x in embeddings) + "]"

        # 2. Build SQL based on run_id presence (run in thread to avoid blocking event loop)
        def _run_recall_query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    if req.run_id:
                        base_where = "payload->>'user_id' = %s"
                        base_params = [req.user_id]
                        if req.agent_id:
                            base_where += " AND payload->>'agent_id' = %s"
                            base_params.append(req.agent_id)

                        cur.execute(f"""
                            SELECT * FROM (
                                (SELECT id::text, payload, vector <=> %s::vector AS distance
                                 FROM memories
                                 WHERE {base_where}
                                 ORDER BY vector <=> %s::vector
                                 LIMIT %s)
                                UNION ALL
                                (SELECT id::text, payload, vector <=> %s::vector AS distance
                                 FROM memories
                                 WHERE payload->>'user_id' = %s AND payload->>'run_id' = %s
                                 ORDER BY vector <=> %s::vector
                                 LIMIT %s)
                            ) combined
                            ORDER BY distance
                        """, (
                            embedding_str, *base_params, embedding_str, req.limit,
                            embedding_str, req.user_id, req.run_id, embedding_str, req.limit,
                        ))
                    else:
                        where = "payload->>'user_id' = %s"
                        params = [req.user_id]
                        if req.agent_id:
                            where += " AND payload->>'agent_id' = %s"
                            params.append(req.agent_id)

                        cur.execute(f"""
                            SELECT id::text, payload, vector <=> %s::vector AS distance
                            FROM memories
                            WHERE {where}
                            ORDER BY vector <=> %s::vector
                            LIMIT %s
                        """, (embedding_str, *params, embedding_str, req.limit))

                    return cur.fetchall()

        rows = await asyncio.to_thread(_run_recall_query)

        # 3. Deduplicate (UNION may produce duplicates)
        seen = set()
        results = []
        for mid, payload, distance in rows:
            if mid in seen:
                continue
            seen.add(mid)
            if isinstance(payload, str):
                payload = json.loads(payload)
            score = 1 - distance
            memory_text = payload.get("data", "") if isinstance(payload, dict) else ""
            metadata = payload.get("metadata", {}) if isinstance(payload, dict) else {}
            # Skip suppressed memories
            if metadata.get("suppressed"):
                continue
            results.append({
                "id": mid,
                "memory": memory_text,
                "score": round(score, 4),
                "metadata": metadata,
                "user_id": payload.get("user_id", "") if isinstance(payload, dict) else "",
                "agent_id": payload.get("agent_id", "") if isinstance(payload, dict) else "",
                "run_id": payload.get("run_id", "") if isinstance(payload, dict) else "",
            })

        # 4. Rerank if enabled and reranker is available
        reranked = False
        if req.rerank and mem0.reranker and results:
            try:
                rerank_results = await asyncio.to_thread(
                    mem0.reranker.rerank,
                    req.query,
                    [{"memory": r["memory"]} for r in results],
                    req.limit,
                )
                rerank_order = {
                    doc["memory"]: (i, doc.get("rerank_score", 0))
                    for i, doc in enumerate(rerank_results)
                }
                for r in results:
                    if r["memory"] in rerank_order:
                        r["rerank_score"] = round(rerank_order[r["memory"]][1], 4)
                reranked_set = {doc["memory"] for doc in rerank_results}
                results.sort(key=lambda r: rerank_order.get(r["memory"], (len(results), 0))[0])
                results = [r for r in results if r["memory"] in reranked_set]
                reranked = True
            except Exception as e:
                logger.warning("RECALL rerank failed (fallback to vector order): %s", e)

        # 5. Threshold filter
        if req.threshold is not None:
            score_key = "rerank_score" if reranked else "score"
            results = [r for r in results if r.get(score_key, r["score"]) >= req.threshold]

        # 6. Limit
        results = results[:req.limit]

        # Update last_accessed_at for hit memories
        hit_ids = [r["id"] for r in results if r.get("id")]
        if hit_ids:
            background_tasks.add_task(update_last_accessed, hit_ids)

        elapsed = time.time() - start
        logger.info(
            "RECALL user=%s query='%s' run_id=%s elapsed=%.2fs hits=%d",
            req.user_id, req.query[:50], req.run_id, elapsed, len(results),
        )
        background_tasks.add_task(
            log_request, "RECALL", req.user_id, req.run_id,
            int(elapsed * 1000), 200, len(results) > 0,
            {"hits": len(results), "has_run_id": bool(req.run_id), "rerank": req.rerank},
            {"query": req.query, "user_id": req.user_id, "run_id": req.run_id},
        )
        return {"results": results, "elapsed_seconds": round(elapsed, 2)}
    except Exception as e:
        logger.exception("Error in search_recall:")
        raise HTTPException(status_code=500, detail=str(e))


class MemoryUpdate(BaseModel):
    data: str = Field(..., description="New memory content text.")


@app.put("/memories/{memory_id}", summary="Update a memory")
async def update_memory(memory_id: str, body: MemoryUpdate, mem0=Depends(get_mem0), _api_key: Optional[str] = Depends(verify_api_key)):
    """Update an existing memory with new content."""
    try:
        return await mem0.update(memory_id=memory_id, data=body.data)
    except Exception as e:
        logger.exception("Error in update_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{memory_id}/history", summary="Get memory history")
async def memory_history(memory_id: str, mem0=Depends(get_mem0), _api_key: Optional[str] = Depends(verify_api_key)):
    """Retrieve memory history."""
    try:
        return await mem0.history(memory_id=memory_id)
    except Exception as e:
        logger.exception("Error in memory_history:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{memory_id}/source", summary="Get memory source conversation")
async def get_memory_source(memory_id: str, _api_key: Optional[str] = Depends(verify_api_key)):
    """Retrieve the original conversation messages that produced this memory."""
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT messages, created_at FROM memory_sources WHERE memory_id = %s ORDER BY created_at ASC",
                        (memory_id,),
                    )
                    return cur.fetchall()

        rows = await asyncio.to_thread(_query)
        return {"results": [{"messages": r[0], "created_at": str(r[1])} for r in rows]}
    except Exception as e:
        logger.warning("Source fetch failed for %s: %s", memory_id, e)
        return {"results": []}


@app.delete("/memories/{memory_id}", summary="Delete a memory")
async def delete_memory(memory_id: str, mem0=Depends(get_mem0), _api_key: Optional[str] = Depends(verify_api_key)):
    """Delete a specific memory by ID."""
    try:
        await mem0.delete(memory_id=memory_id)
        return {"message": "Memory deleted successfully"}
    except Exception as e:
        logger.exception("Error in delete_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memories", summary="Delete all memories")
async def delete_all_memories(
    user_id: Optional[str] = None,
    run_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Delete all memories for a given identifier."""
    if not any([user_id, run_id, agent_id]):
        raise HTTPException(status_code=400, detail="At least one identifier is required.")
    try:
        params = {
            k: v for k, v in {"user_id": user_id, "run_id": run_id, "agent_id": agent_id}.items() if v is not None
        }
        await mem0.delete_all(**params)
        return {"message": "All relevant memories deleted"}
    except Exception as e:
        logger.exception("Error in delete_all_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset", summary="Reset all memories")
async def reset_memory(mem0=Depends(get_mem0), _api_key: Optional[str] = Depends(verify_api_key)):
    """Completely reset stored memories."""
    try:
        await mem0.reset()
        return {"message": "All memories reset"}
    except Exception as e:
        logger.exception("Error in reset_memory:")
        raise HTTPException(status_code=500, detail=str(e))


# --- Request log endpoints ---
@app.get("/requests/daily-stats", summary="Daily request statistics")
async def get_daily_stats(
    days: int = Query(default=30, ge=1, le=365),
    request_type: Optional[str] = Query(default=None),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Daily request counts for dashboard charts."""
    try:
        params: list = [days, days]
        type_filter = ""
        if request_type and request_type.upper() != "ALL":
            type_filter = "AND request_type = %s"
            params.append(request_type.upper())

        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT
                            d::date as date,
                            COALESCE(r.total, 0) as total,
                            COALESCE(r.add_count, 0) as add_count,
                            COALESCE(r.search_count, 0) as search_count,
                            COALESCE(r.recall_count, 0) as recall_count
                        FROM generate_series(
                            (NOW() - make_interval(days => %s))::date,
                            NOW()::date,
                            '1 day'::interval
                        ) d
                        LEFT JOIN (
                            SELECT
                                DATE(created_at) as date,
                                COUNT(*) as total,
                                COUNT(*) FILTER (WHERE request_type = 'ADD') as add_count,
                                COUNT(*) FILTER (WHERE request_type = 'SEARCH') as search_count,
                                COUNT(*) FILTER (WHERE request_type = 'RECALL') as recall_count
                            FROM api_requests
                            WHERE created_at >= NOW() - make_interval(days => %s)
                            {type_filter}
                            GROUP BY DATE(created_at)
                        ) r ON d::date = r.date
                        ORDER BY d
                    """, params)
                    return cur.fetchall()

        rows = await asyncio.to_thread(_query)
        stats = [
            {"date": str(r[0]), "total": r[1], "add": r[2], "search": r[3], "recall": r[4]}
            for r in rows
        ]
        return {"days": days, "stats": stats}
    except Exception as e:
        logger.exception("Error in get_daily_stats:")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/requests/{request_id}", summary="Get request detail")
async def get_request_detail(request_id: str, _api_key: Optional[str] = Depends(verify_api_key)):
    """Retrieve a specific API request log entry."""
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, request_type, user_id, run_id, latency_ms, status_code,
                               has_results, event_summary, req_payload, memory_actions,
                               retrieved_memories, error_msg, created_at
                        FROM api_requests WHERE id = %s
                    """, (request_id,))
                    return cur.fetchone()

        row = await asyncio.to_thread(_query)
        if not row:
            raise HTTPException(status_code=404, detail="Request not found")
        return {
            "id": str(row[0]), "request_type": row[1], "user_id": row[2], "run_id": row[3],
            "latency_ms": row[4], "status_code": row[5], "has_results": row[6],
            "event_summary": row[7], "req_payload": row[8], "memory_actions": row[9],
            "retrieved_memories": row[10], "error_msg": row[11], "created_at": str(row[12]),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in get_request_detail:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/requests", summary="List API request logs")
async def list_requests(
    request_type: Optional[str] = None,
    has_results: Optional[bool] = None,
    user_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """List API request log entries with optional filters."""
    try:
        conds = []
        params: list = []
        if request_type:
            conds.append("request_type = %s")
            params.append(request_type)
        if has_results is not None:
            conds.append("has_results = %s")
            params.append(has_results)
        if user_id:
            conds.append("user_id = %s")
            params.append(user_id)
        where = ("WHERE " + " AND ".join(conds)) if conds else ""

        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT id, request_type, user_id, run_id, latency_ms, status_code,
                               has_results, event_summary, req_payload, created_at
                        FROM api_requests {where}
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s
                    """, params + [limit, offset])
                    rows = cur.fetchall()
                    cur.execute(f"SELECT COUNT(*) FROM api_requests {where}", params)
                    total = cur.fetchone()[0]
                    return rows, total

        rows, total = await asyncio.to_thread(_query)
        items = [
            {
                "id": str(r[0]), "request_type": r[1], "user_id": r[2], "run_id": r[3],
                "latency_ms": r[4], "status_code": r[5], "has_results": r[6],
                "event_summary": r[7], "req_payload": r[8], "created_at": str(r[9]),
            }
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.exception("Error in list_requests:")
        raise HTTPException(status_code=500, detail=str(e))


# --- Entity management endpoints ---
@app.get("/entities/by-type", summary="List entities by type", dependencies=[Depends(verify_maintenance_key)])
async def list_entities_by_type(
    entity_type: str = Query(..., description="Entity type: user, agent, app, run"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List all entities of a given type with memory counts."""
    FIELD_MAP = {
        "user": "payload->>'user_id'",
        "agent": "payload->>'agent_id'",
        "app": "payload->'metadata'->>'app_id'",
        "run": "payload->>'run_id'",
    }
    if entity_type not in FIELD_MAP:
        raise HTTPException(status_code=400, detail=f"entity_type must be one of: {', '.join(FIELD_MAP)}")
    field_expr = FIELD_MAP[entity_type]
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"""
                        SELECT entity_id, memory_count, updated_at, COUNT(*) OVER() AS total
                        FROM (
                            SELECT {field_expr} AS entity_id,
                                   COUNT(*) AS memory_count,
                                   COALESCE(
                                       MAX((payload->>'updated_at')::timestamptz),
                                       MAX((payload->>'created_at')::timestamptz)
                                   ) AS updated_at
                            FROM memories WHERE {field_expr} IS NOT NULL
                            GROUP BY 1
                        ) sub
                        ORDER BY updated_at DESC NULLS LAST
                        LIMIT %s OFFSET %s
                    """, (limit, offset))
                    return cur.fetchall()

        rows = await asyncio.to_thread(_query)
        total = rows[0][3] if rows else 0
        entities = [
            {"id": r[0], "updated_at": r[2].isoformat() if r[2] else None, "memory_count": r[1]}
            for r in rows
        ]
        return {"entity_type": entity_type, "entities": entities, "total": total}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in list_entities_by_type:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/entities/users", summary="List all users", dependencies=[Depends(verify_maintenance_key)])
async def list_entity_users():
    """List all distinct user_ids with memory and agent counts."""
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT payload->>'user_id' AS uid,
                               COUNT(*) AS memory_count,
                               COUNT(DISTINCT payload->>'agent_id')
                                   FILTER (WHERE payload->>'agent_id' IS NOT NULL) AS agent_count
                        FROM memories WHERE payload->>'user_id' IS NOT NULL
                        GROUP BY uid ORDER BY memory_count DESC
                    """)
                    return cur.fetchall()

        rows = await asyncio.to_thread(_query)
        return {"users": [{"user_id": r[0], "memory_count": r[1], "agent_count": r[2]} for r in rows]}
    except Exception as e:
        logger.exception("Error in list_entity_users:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/entities", summary="List entities for a user")
async def list_entities(
    user_id: str = Query(..., description="User ID"),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """List agents and apps under a user with memory counts."""
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) FROM memories WHERE payload->>'user_id' = %s", (user_id,))
                    total = cur.fetchone()[0]
                    cur.execute("""
                        SELECT payload->>'agent_id', COUNT(*) FROM memories
                        WHERE payload->>'user_id' = %s AND payload->>'agent_id' IS NOT NULL
                        GROUP BY 1 ORDER BY COUNT(*) DESC
                    """, (user_id,))
                    agents = [{"agent_id": r[0], "memory_count": r[1]} for r in cur.fetchall()]
                    cur.execute("""
                        SELECT payload->'metadata'->>'app_id', COUNT(*) FROM memories
                        WHERE payload->>'user_id' = %s AND payload->'metadata'->>'app_id' IS NOT NULL
                        GROUP BY 1 ORDER BY COUNT(*) DESC
                    """, (user_id,))
                    apps = [{"app_id": r[0], "memory_count": r[1]} for r in cur.fetchall()]
                    return total, agents, apps

        total, agents, apps = await asyncio.to_thread(_query)
        return {"user_id": user_id, "agents": agents, "apps": apps, "total_memories": total}
    except Exception as e:
        logger.exception("Error in list_entities:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/entities/{entity_type}/{entity_id}", summary="Delete an entity's memories",
            dependencies=[Depends(verify_maintenance_key)])
async def delete_entity(
    entity_type: str,
    entity_id: str,
    confirm: bool = Query(False, description="Must be true to confirm deletion"),
    user_id: Optional[str] = Query(None, description="Required when deleting an agent"),
    mem0=Depends(get_mem0),
):
    """Delete all memories for a user or agent entity."""
    if entity_type not in ("user", "agent"):
        raise HTTPException(status_code=400, detail="entity_type must be 'user' or 'agent'")
    if not confirm:
        raise HTTPException(status_code=400, detail="Must set confirm=true to execute deletion")
    if entity_type == "agent" and not user_id:
        raise HTTPException(status_code=400, detail="user_id is required when deleting an agent")
    try:
        if entity_type == "user":
            result = await mem0.delete_all(user_id=entity_id)
            # Cleanup orphaned feedback
            try:
                def _cleanup():
                    with get_pg_conn() as conn:
                        with conn.cursor() as cur:
                            cur.execute("DELETE FROM memory_feedback WHERE user_id = %s", (entity_id,))

                await asyncio.to_thread(_cleanup)
            except Exception as e:
                logger.warning("Feedback cleanup failed for user=%s: %s", entity_id, e)
        else:
            result = await mem0.delete_all(user_id=user_id, agent_id=entity_id)
            try:
                def _cleanup():
                    with get_pg_conn() as conn:
                        with conn.cursor() as cur:
                            cur.execute("""
                                DELETE FROM memory_feedback
                                WHERE NOT EXISTS (SELECT 1 FROM memories WHERE memories.id = memory_feedback.memory_id)
                            """)

                await asyncio.to_thread(_cleanup)
            except Exception as e:
                logger.warning("Feedback cleanup failed for agent=%s: %s", entity_id, e)

        logger.warning("DELETE_ENTITY %s=%s", entity_type, entity_id)
        return {"status": "deleted", "entity_type": entity_type, "entity_id": entity_id, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error in delete_entity:")
        raise HTTPException(status_code=500, detail=str(e))


# --- Maintenance endpoints ---
@app.post("/maintenance/decay", summary="Decay importance scores",
          dependencies=[Depends(verify_maintenance_key)])
async def maintenance_decay(
    user_id: str = Query(...),
    decay_lambda: float = Query(0.01, description="Decay rate. 0.01 = ~70 day half-life."),
    dry_run: bool = Query(True, description="Preview only, don't apply changes."),
):
    """Exponential decay on importance_score based on days since last access."""
    try:
        decay_sql = """
            COALESCE((payload->'metadata'->>'importance_score')::float, 1.0)
            * exp(-%s * GREATEST(
                EXTRACT(EPOCH FROM (NOW() - COALESCE(
                    (payload->'metadata'->>'last_accessed_at')::timestamptz,
                    (payload->>'created_at')::timestamptz,
                    NOW()
                ))) / 86400.0, 0
            ))
        """
        where = "payload->>'user_id' = %s AND payload->'metadata'->>'importance_score' IS NOT NULL"

        def _run():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    if dry_run:
                        cur.execute(f"""
                            SELECT id::text,
                                   COALESCE(payload->>'data', payload->>'memory'),
                                   COALESCE((payload->'metadata'->>'importance_score')::float, 1.0),
                                   payload->'metadata'->>'last_accessed_at',
                                   {decay_sql} AS new_score
                            FROM memories WHERE {where}
                            ORDER BY 3 DESC
                        """, (decay_lambda, user_id))
                        return cur.fetchall(), None
                    else:
                        cur.execute(f"""
                            UPDATE memories SET payload = jsonb_set(
                                payload, '{{metadata,importance_score}}', to_jsonb({decay_sql})
                            ) WHERE {where}
                        """, (decay_lambda, user_id))
                        return None, cur.rowcount

        rows, affected = await asyncio.to_thread(_run)
        if dry_run:
            return {
                "dry_run": True, "total": len(rows), "decay_lambda": decay_lambda,
                "memories": [
                    {"id": r[0], "memory": (r[1] or "")[:100], "current_score": round(r[2], 4),
                     "last_accessed_at": r[3], "new_score": round(r[4], 4)}
                    for r in rows
                ],
            }
        logger.info("DECAY applied: %d memories, lambda=%s", affected, decay_lambda)
        return {"dry_run": False, "affected": affected, "decay_lambda": decay_lambda}
    except Exception as e:
        logger.exception("Error in maintenance_decay:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/maintenance/dedup", summary="Semantic deduplication",
          dependencies=[Depends(verify_maintenance_key)])
async def maintenance_dedup(
    user_id: str = Query(...),
    threshold: float = Query(0.95, description="Cosine similarity threshold for duplicates."),
    dry_run: bool = Query(True),
    max_memories: int = Query(1000, ge=1, le=5000),
    mem0=Depends(get_mem0),
):
    """Find and remove near-duplicate memories based on cosine similarity."""
    try:
        def _fetch():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id::text, COALESCE(payload->>'data', payload->>'memory'),
                               embedding,
                               COALESCE((payload->>'updated_at')::timestamptz,
                                        (payload->>'created_at')::timestamptz) AS updated_at
                        FROM memories WHERE payload->>'user_id' = %s
                        ORDER BY updated_at DESC NULLS LAST LIMIT %s
                    """, (user_id, max_memories))
                    return cur.fetchall()

        rows = await asyncio.to_thread(_fetch)
        if len(rows) < 2:
            return {"dry_run": dry_run, "total_checked": len(rows), "duplicates_found": 0, "pairs": []}

        # Parse embeddings
        memories = []
        for mid, text, emb_raw, updated_at in rows:
            if emb_raw is None:
                continue
            if isinstance(emb_raw, str):
                emb = [float(x) for x in emb_raw.strip("[]").split(",")]
            elif isinstance(emb_raw, list):
                emb = [float(x) for x in emb_raw]
            else:
                continue
            memories.append({"id": mid, "text": text or "", "embedding": emb,
                             "updated_at": str(updated_at) if updated_at else ""})

        # Pairwise cosine similarity in thread pool
        def _compute(mems, thresh):
            def _dot(a, b): return sum(x * y for x, y in zip(a, b))
            def _norm(a): return math.sqrt(sum(x * x for x in a))
            norms = [_norm(m["embedding"]) for m in mems]
            deleted, pairs = set(), []
            for i in range(len(mems)):
                if mems[i]["id"] in deleted:
                    continue
                for j in range(i + 1, len(mems)):
                    if mems[j]["id"] in deleted or norms[i] == 0 or norms[j] == 0:
                        continue
                    sim = _dot(mems[i]["embedding"], mems[j]["embedding"]) / (norms[i] * norms[j])
                    if sim >= thresh:
                        deleted.add(mems[j]["id"])
                        pairs.append({
                            "keep": {"id": mems[i]["id"], "text": mems[i]["text"][:100]},
                            "delete": {"id": mems[j]["id"], "text": mems[j]["text"][:100]},
                            "similarity": round(sim, 4),
                        })
            return deleted, pairs

        to_delete, pairs = await asyncio.to_thread(_compute, memories, threshold)

        deleted_count = 0
        if not dry_run and to_delete:
            for mid in to_delete:
                try:
                    await mem0.delete(memory_id=mid)
                    deleted_count += 1
                except Exception as e:
                    logger.warning("DEDUP delete failed for %s: %s", mid, e)
            logger.info("DEDUP completed: %d/%d deleted for user=%s", deleted_count, len(to_delete), user_id)

        return {
            "dry_run": dry_run, "total_checked": len(memories), "threshold": threshold,
            "duplicates_found": len(pairs), "to_delete": len(to_delete),
            "deleted": deleted_count, "pairs": pairs,
        }
    except Exception as e:
        logger.exception("Error in maintenance_dedup:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/maintenance/cleanup-expired", summary="Clean up expired and low-importance memories",
          dependencies=[Depends(verify_maintenance_key)])
async def maintenance_cleanup_expired(
    user_id: str = Query(...),
    dry_run: bool = Query(True),
    include_low_importance: bool = Query(True, description="Also delete memories below importance threshold."),
    importance_threshold: float = Query(0.1, description="Memories below this score are candidates."),
    mem0=Depends(get_mem0),
):
    """Delete TTL-expired memories and optionally low-importance ones."""
    try:
        def _fetch():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id::text, COALESCE(payload->>'data', payload->>'memory'),
                               payload->'metadata'->>'expires_at',
                               payload->'metadata'->>'importance_score', 'expired' AS reason
                        FROM memories
                        WHERE payload->>'user_id' = %s
                          AND payload->'metadata'->>'expires_at' IS NOT NULL
                          AND (payload->'metadata'->>'expires_at')::timestamptz < NOW()
                    """, (user_id,))
                    expired = cur.fetchall()

                    low = []
                    if include_low_importance:
                        cur.execute("""
                            SELECT id::text, COALESCE(payload->>'data', payload->>'memory'),
                                   payload->'metadata'->>'expires_at',
                                   payload->'metadata'->>'importance_score', 'low_importance' AS reason
                            FROM memories
                            WHERE payload->>'user_id' = %s
                              AND payload->'metadata'->>'importance_score' IS NOT NULL
                              AND (payload->'metadata'->>'importance_score')::float < %s
                        """, (user_id, importance_threshold))
                        low = cur.fetchall()
                    return expired, low

        expired_rows, low_rows = await asyncio.to_thread(_fetch)

        # Merge and deduplicate
        candidates = {}
        for row in expired_rows + low_rows:
            mid = row[0]
            if mid not in candidates:
                candidates[mid] = {
                    "id": mid, "memory": (row[1] or "")[:100], "expires_at": row[2],
                    "importance_score": float(row[3]) if row[3] else None, "reason": row[4],
                }
            else:
                candidates[mid]["reason"] = "expired+low_importance"

        candidate_list = list(candidates.values())
        deleted_count = 0
        if not dry_run and candidate_list:
            for c in candidate_list:
                try:
                    await mem0.delete(memory_id=c["id"])
                    deleted_count += 1
                except Exception as e:
                    logger.warning("CLEANUP delete failed for %s: %s", c["id"], e)
            logger.info("CLEANUP completed: %d/%d deleted", deleted_count, len(candidate_list))

        return {
            "dry_run": dry_run, "expired_count": len(expired_rows),
            "low_importance_count": len(low_rows), "total_candidates": len(candidate_list),
            "deleted": deleted_count, "importance_threshold": importance_threshold,
            "candidates": candidate_list,
        }
    except Exception as e:
        logger.exception("Error in maintenance_cleanup:")
        raise HTTPException(status_code=500, detail=str(e))


# --- Feedback endpoints ---
@app.post("/memories/{memory_id}/feedback", summary="Submit feedback for a memory")
async def submit_feedback(
    memory_id: str,
    req: FeedbackRequest,
    background_tasks: BackgroundTasks,
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Submit feedback for a memory. very_negative auto-suppresses the memory."""
    start = time.time()
    try:
        def _write():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id FROM memories WHERE id = %s AND payload->>'user_id' = %s",
                        (memory_id, req.user_id),
                    )
                    if not cur.fetchone():
                        return False
                    cur.execute(
                        "INSERT INTO memory_feedback (memory_id, user_id, feedback, reason) VALUES (%s, %s, %s, %s)",
                        (memory_id, req.user_id, req.feedback, req.reason),
                    )
                    if req.feedback == "very_negative":
                        cur.execute(
                            """UPDATE memories
                               SET payload = jsonb_set(
                                   COALESCE(payload, '{}'), '{metadata}',
                                   COALESCE(payload->'metadata', '{}') || '{"suppressed": true}'::jsonb
                               )
                               WHERE id = %s AND payload->>'user_id' = %s""",
                            (memory_id, req.user_id),
                        )
                return True

        found = await asyncio.to_thread(_write)
        if not found:
            raise HTTPException(status_code=404, detail="Memory not found for this user.")

        elapsed_ms = int((time.time() - start) * 1000)
        background_tasks.add_task(
            log_request, "FEEDBACK", req.user_id, None, elapsed_ms, 200, True,
            {"memory_id": memory_id, "feedback": req.feedback},
            {"memory_id": memory_id, "user_id": req.user_id, "feedback": req.feedback},
        )
        logger.info("FEEDBACK submitted: memory=%s feedback=%s", memory_id, req.feedback)
        return {"status": "ok", "memory_id": memory_id, "feedback": req.feedback}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in submit_feedback:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{memory_id}/feedback", summary="Get feedback for a memory")
async def get_feedback(memory_id: str, _api_key: Optional[str] = Depends(verify_api_key)):
    """Retrieve all feedback records for a specific memory."""
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """SELECT id, memory_id, user_id, feedback, reason, created_at
                           FROM memory_feedback WHERE memory_id = %s
                           ORDER BY created_at DESC""",
                        (memory_id,),
                    )
                    return cur.fetchall()

        rows = await asyncio.to_thread(_query)
        results = [
            {"id": r[0], "memory_id": r[1], "user_id": r[2], "feedback": r[3],
             "reason": r[4], "created_at": str(r[5])}
            for r in rows
        ]
        return {"memory_id": memory_id, "feedbacks": results, "total": len(results)}
    except Exception as e:
        logger.exception("Error in get_feedback:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/feedback/stats", summary="Feedback statistics")
async def feedback_stats(
    user_id: str = Query(..., description="User ID to get feedback stats for"),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Feedback counts by type and recent negative feedback."""
    try:
        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT feedback, COUNT(*) FROM memory_feedback WHERE user_id = %s GROUP BY feedback",
                        (user_id,),
                    )
                    counts = {r[0]: r[1] for r in cur.fetchall()}
                    cur.execute(
                        """SELECT mf.memory_id, mf.feedback, mf.reason, mf.created_at,
                                  COALESCE(m.payload->>'data', m.payload->>'memory') AS memory_text
                           FROM memory_feedback mf
                           LEFT JOIN memories m ON m.id = mf.memory_id
                           WHERE mf.user_id = %s AND mf.feedback IN ('negative', 'very_negative')
                           ORDER BY mf.created_at DESC LIMIT 10""",
                        (user_id,),
                    )
                    negative_rows = cur.fetchall()
                    return counts, negative_rows

        counts, negative_rows = await asyncio.to_thread(_query)
        return {
            "user_id": user_id,
            "total": sum(counts.values()),
            "positive": counts.get("positive", 0),
            "negative": counts.get("negative", 0),
            "very_negative": counts.get("very_negative", 0),
            "recent_negative": [
                {"memory_id": r[0], "feedback": r[1], "reason": r[2],
                 "created_at": str(r[3]), "memory_text": (r[4] or "")[:200]}
                for r in negative_rows
            ],
        }
    except Exception as e:
        logger.exception("Error in feedback_stats:")
        raise HTTPException(status_code=500, detail=str(e))


# --- Statistics endpoint ---
@app.get("/stats", summary="Memory system statistics")
async def get_stats(
    user_id: str = Query(..., description="User ID"),
    agent_id: Optional[str] = Query(None),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Aggregated statistics: total memories, category distribution, importance, recent activity."""
    try:
        base_cond = "payload->>'user_id' = %s"
        base_params: list = [user_id]
        if agent_id:
            base_cond += " AND payload->>'agent_id' = %s"
            base_params.append(agent_id)

        def _query():
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT COUNT(*) FROM memories WHERE {base_cond}", base_params)
                    total = cur.fetchone()[0]

                    cur.execute(f"""
                        SELECT payload->'metadata'->>'category', COUNT(*)
                        FROM memories WHERE {base_cond} AND payload->'metadata'->>'category' IS NOT NULL
                        GROUP BY 1 ORDER BY COUNT(*) DESC
                    """, base_params)
                    categories = {r[0]: r[1] for r in cur.fetchall()}

                    cur.execute(f"""
                        SELECT AVG((payload->'metadata'->>'importance_score')::float)
                        FROM memories WHERE {base_cond} AND payload->'metadata'->>'importance_score' IS NOT NULL
                    """, base_params)
                    avg_row = cur.fetchone()
                    avg_importance = round(avg_row[0], 4) if avg_row[0] else None

                    cur.execute("""
                        SELECT request_type, COUNT(*) FROM api_requests
                        WHERE user_id = %s AND created_at >= NOW() - INTERVAL '7 days'
                          AND request_type IN ('ADD', 'SEARCH', 'RECALL')
                        GROUP BY request_type
                    """, (user_id,))
                    recent = {r[0]: r[1] for r in cur.fetchall()}

                    cur.execute(f"""
                        SELECT COUNT(*) FROM memories WHERE {base_cond}
                          AND payload->'metadata'->>'expires_at' IS NOT NULL
                          AND (payload->'metadata'->>'expires_at')::timestamptz < NOW()
                    """, base_params)
                    expired = cur.fetchone()[0]

                    cur.execute(f"""
                        SELECT COUNT(*) FROM memories WHERE {base_cond}
                          AND payload->'metadata'->>'importance_score' IS NOT NULL
                          AND (payload->'metadata'->>'importance_score')::float < 0.1
                    """, base_params)
                    low_importance = cur.fetchone()[0]

                    return total, categories, avg_importance, recent, expired, low_importance

        total, categories, avg_importance, recent, expired, low_importance = await asyncio.to_thread(_query)
        return {
            "user_id": user_id,
            "agent_id": agent_id,
            "total_memories": total,
            "category_counts": categories,
            "avg_importance_score": avg_importance,
            "recent_7d": {
                "add_count": recent.get("ADD", 0),
                "search_count": recent.get("SEARCH", 0),
                "recall_count": recent.get("RECALL", 0),
            },
            "expired_count": expired,
            "low_importance_count": low_importance,
        }
    except Exception as e:
        logger.exception("Error in get_stats:")
        raise HTTPException(status_code=500, detail=str(e))


# --- Classification endpoints ---
@app.get("/taxonomy", summary="Get classification taxonomy")
async def get_taxonomy(_api_key: Optional[str] = Depends(verify_api_key)):
    """Return the current classification taxonomy."""
    return _TAXONOMY


@app.post("/memories/{memory_id}/reclassify", summary="Reclassify a memory")
async def reclassify_memory(
    memory_id: str,
    background_tasks: BackgroundTasks,
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Trigger re-classification for an existing memory."""
    try:
        result = await mem0.get(memory_id)
        memory_text = ""
        if isinstance(result, dict):
            memory_text = result.get("memory") or result.get("data") or ""
        elif isinstance(result, list) and result:
            memory_text = result[0].get("memory") or result[0].get("data") or ""
        if not memory_text:
            raise HTTPException(status_code=404, detail="Memory text not found")
        background_tasks.add_task(classify_and_store, memory_id, memory_text)
        return {"status": "queued", "memory_id": memory_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reclassify-all", summary="Reclassify all memories for a user")
async def reclassify_all(
    background_tasks: BackgroundTasks,
    user_id: str = Query(..., description="User ID to reclassify memories for"),
    only_unclassified: bool = Query(True, description="Only reclassify memories without a category"),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Bulk re-classify memories. Defaults to only unclassified ones."""
    try:
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                sql = "SELECT id, COALESCE(payload->>'data', payload->>'memory') FROM memories WHERE payload->>'user_id' = %s"
                if only_unclassified:
                    sql += " AND (payload->'metadata'->>'category') IS NULL"
                cur.execute(sql, (user_id,))
                rows = cur.fetchall()
        count = 0
        for mid, text in rows:
            if text:
                background_tasks.add_task(classify_and_store, str(mid), text)
                count += 1
        return {"status": "queued", "count": count, "only_unclassified": only_unclassified}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/", summary="Redirect to the OpenAPI documentation", include_in_schema=False)
async def home():
    """Redirect to the OpenAPI documentation."""
    return RedirectResponse(url="/docs")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)

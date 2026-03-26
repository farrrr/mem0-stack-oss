"""
Mem0 Self-Hosted API Server (Open Source Edition)

Changes from upstream:
- Sync Memory → AsyncMemory (non-blocking I/O)
- Module-level init → FastAPI lifespan (clean startup/shutdown)
- Added /health endpoint
"""
import logging
import os
import secrets
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
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

# --- Config from env ---
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "postgres")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_COLLECTION_NAME = os.environ.get("POSTGRES_COLLECTION_NAME", "memories")

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USERNAME = os.environ.get("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "mem0graph")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
HISTORY_DB_PATH = os.environ.get("HISTORY_DB_PATH", "/app/history/history.db")

if not OPENAI_API_KEY:
    logger.warning("OPENAI_API_KEY not set - LLM and embedding calls will fail.")

PG_POOL_MIN = int(os.environ.get("PG_POOL_MIN", "2"))
PG_POOL_MAX = int(os.environ.get("PG_POOL_MAX", "80"))


def _build_config() -> dict:
    """Build mem0 configuration from environment variables."""
    return {
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
                "minconn": PG_POOL_MIN,
                "maxconn": PG_POOL_MAX,
            },
        },
        "graph_store": {
            "provider": "neo4j",
            "config": {"url": NEO4J_URI, "username": NEO4J_USERNAME, "password": NEO4J_PASSWORD},
        },
        "llm": {
            "provider": "openai",
            "config": {"api_key": OPENAI_API_KEY, "temperature": 0.2, "model": "gpt-4.1-nano-2025-04-14"},
        },
        "embedder": {
            "provider": "openai",
            "config": {"api_key": OPENAI_API_KEY, "model": "text-embedding-3-small"},
        },
        "history_db_path": HISTORY_DB_PATH,
    }


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
    prompt: Optional[str] = Field(None, description="Custom prompt to use for fact extraction.")


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query.")
    user_id: Optional[str] = None
    run_id: Optional[str] = None
    agent_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    limit: Optional[int] = Field(None, description="Maximum number of results to return.")
    threshold: Optional[float] = Field(None, description="Minimum similarity score for results.")


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
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Store new memories."""
    if not any([memory_create.user_id, memory_create.agent_id, memory_create.run_id]):
        raise HTTPException(status_code=400, detail="At least one identifier (user_id, agent_id, run_id) is required.")

    params = {k: v for k, v in memory_create.model_dump().items() if v is not None and k != "messages"}
    try:
        response = await mem0.add(messages=[m.model_dump() for m in memory_create.messages], **params)
        return JSONResponse(content=response)
    except Exception as e:
        logger.exception("Error in add_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories", summary="Get memories")
async def get_all_memories(
    user_id: Optional[str] = None,
    run_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    mem0=Depends(get_mem0),
    _api_key: Optional[str] = Depends(verify_api_key),
):
    """Retrieve stored memories."""
    if not any([user_id, run_id, agent_id]):
        raise HTTPException(status_code=400, detail="At least one identifier is required.")
    try:
        params = {
            k: v for k, v in {"user_id": user_id, "run_id": run_id, "agent_id": agent_id}.items() if v is not None
        }
        return await mem0.get_all(**params)
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
async def search_memories(search_req: SearchRequest, mem0=Depends(get_mem0), _api_key: Optional[str] = Depends(verify_api_key)):
    """Search for memories based on a query."""
    try:
        params = {k: v for k, v in search_req.model_dump().items() if v is not None and k != "query"}
        return await mem0.search(query=search_req.query, **params)
    except Exception as e:
        logger.exception("Error in search_memories:")
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


@app.get("/", summary="Redirect to the OpenAPI documentation", include_in_schema=False)
async def home():
    """Redirect to the OpenAPI documentation."""
    return RedirectResponse(url="/docs")

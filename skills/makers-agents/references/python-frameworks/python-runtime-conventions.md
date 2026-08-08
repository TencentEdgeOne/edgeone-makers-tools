# Python Runtime Conventions (all Python routes)

> Shared by every Python route (CrewAI / LangGraph / DeepAgents / OpenAI Agents / Claude SDK).


The Python agent runtime is an ASGI application (runs on uvicorn). It shares the same platform conventions as the Node runtime, but with Python-specific idioms.

### Entry Signature

```python
async def handler(ctx):
    """Every Python agent endpoint exports a top-level `handler` function."""
    ...
```

- The parameter is an `AgentContext` dataclass (imported from `_platform.context` internally, but you never need to import it yourself).
- File-based routing: `agents/<name>/index.py` or `agents/<name>.py` → `POST /<name>` (same as TS).
- Internal modules use `_` prefix: `_llm.py`, `_tools.py`, `_state.py` etc.

### Context Object (`ctx`)

| Field | Type | Description |
|-------|------|-------------|
| `ctx.request.body` | `dict` | Parsed JSON request body |
| `ctx.request.headers` | `dict` | Request headers (lowercase keys) |
| `ctx.request.signal` | `asyncio.Event` | Cancellation signal — check with `ctx.request.signal.is_set()` |
| `ctx.request.query` | `dict` | URL query parameters |
| `ctx.env` | `dict` | Environment variables (⚠️ never use `os.environ` in agent code) |
| `ctx.conversation_id` | `str` | From `makers-conversation-id` header |
| `ctx.run_id` | `str` | Current run ID |
| `ctx.store` | `ConversationMemory` | Message history CRUD + LangGraph adapters |
| `ctx.tools` | Tools | Platform tools (lazy-loaded, shaped by `agents.framework`) |
| `ctx.sandbox` | Sandbox | Sandbox client (lazy-loaded) |
| `ctx.kv` | KV store | Per-route KV store |
| `ctx.utils` | `ContextUtils` | Platform utilities (SSE, abort, etc.) |

### SSE Streaming (recommended pattern)

```python
async def handler(ctx):
    async def gen():
        yield ctx.utils.sse({"type": "ai_response", "content": "Hello"})
        yield ctx.utils.sse({"type": "ping", "ts": int(time.time() * 1000)})
        yield b"data: [DONE]\n\n"
    return ctx.utils.stream_sse(gen())
```

- `ctx.utils.sse(data, event=None)` → returns `bytes` (one SSE frame)
- `ctx.utils.stream_sse(gen())` → returns `StreamResponse` with correct headers (Content-Type, Cache-Control, X-Accel-Buffering, Connection)
- No need to manually set response headers — the platform handles them.

### Memory / Store API (snake_case)

```python
# Append a message
msg_id = await ctx.store.append_message(ctx.conversation_id, "user", "Hello!")

# Get messages (ascending by time, for prompt construction)
messages = await ctx.store.get_messages(ctx.conversation_id, limit=50)

# Convert to OpenAI format
openai_msgs = ctx.store.to_openai_input(messages)

# LangGraph adapters (direct properties, snake_case)
checkpointer = ctx.store.langgraph_checkpointer
lg_store = ctx.store.langgraph_store
```

### /stop Endpoint

```python
async def handler(ctx):
    target = ctx.request.body.get("conversation_id") or ""
    result = ctx.utils.abortActiveRun(target)  # camelCase (aligned with Node)
    # or: result = ctx.utils.abort_active_run(target)  # snake_case alias
    return {
        "status": "aborted" if result.aborted else "idle",
        "conversation_id": result.conversation_id,
        "run_id": result.run_id,
    }
```

### Key Differences from Node Runtime

| Dimension | Node (TS) | Python |
|-----------|-----------|--------|
| Abort signal | `signal.aborted` (boolean) | `ctx.request.signal.is_set()` (asyncio.Event) |
| Abort utility | `ctx.utils.abortActiveRun(id)` | `ctx.utils.abortActiveRun(id)` or `ctx.utils.abort_active_run(id)` |
| SSE helper | `createSSEResponse(gen, signal)` | `ctx.utils.stream_sse(gen())` |
| Store methods | camelCase: `appendMessage`, `getMessages` | snake_case: `append_message`, `get_messages` |
| LangGraph adapters | `ctx.store.langgraphCheckpointer` | `ctx.store.langgraph_checkpointer` |
| Return type | `Response` object | `dict` / `StreamResponse` / async generator |
| Blocking work | N/A | Wrap in `asyncio.to_thread()` (e.g., `crew.kickoff()`) |


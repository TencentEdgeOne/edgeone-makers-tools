# Migration: CrewAI (Python-only) → EdgeOne Makers

CrewAI has no JS SDK, so this route is Python-only. The migration is about: routing the LLM through AI Gateway (`provider="openai"` to bypass LiteLLM), dropping `memory=True`/`verbose=True` for platform conventions, wrapping `crew.kickoff()` in a thread, and bridging the event_bus to Makers SSE.

---

## ❌ Before — native CrewAI (Flask + direct OpenAI + LiteLLM)

```python
# app.py
from flask import Flask, request, jsonify, Response
import json
from crewai import Agent, Crew, Process, Task, LLM

app = Flask(__name__)

# 1. LiteLLM dispatch by default (CrewAI 1.14+) — needs litellm installed
llm = LLM(model="gpt-4o", api_key=os.environ["OPENAI_API_KEY"])

researcher = Agent(role="Researcher", goal="Answer questions", backstory="...", llm=llm, verbose=True)
task = Task(description="Answer: {q}", expected_output="answer", agent=researcher)

crew = Crew(agents=[researcher], tasks=[task], process=Process.sequential, memory=True, verbose=True)

@app.post("/chat")
def chat():
    q = request.json["q"]
    result = crew.kickoff(inputs={"q": q})   # 2. blocking call, no SSE
    return jsonify({"answer": str(result)})
```

### Problems with the native version
- `LLM(model="gpt-4o", api_key=os.environ[...])` → LiteLLM dispatch (absent on Makers image → crash)
- `crew.kickoff()` is blocking → event loop stalls, no streaming
- `verbose=True` / `memory=True` → stdout noise + double memory
- Flask server → must become a Makers `handler(ctx)`

---

## ✅ After — Makers agent handler

```python
# agents/chat/index.py
import asyncio
import json
from typing import AsyncIterator

DEFAULT_MODEL = "@makers/deepseek-v4-flash"

def get_llm(env: dict):
    from crewai import LLM
    return LLM(
        model=env.get("AI_GATEWAY_MODEL", DEFAULT_MODEL),
        provider="openai",                 # ⭐ bypass LiteLLM (not bundled on platform)
        api_key=env["AI_GATEWAY_API_KEY"],
        base_url=env["AI_GATEWAY_BASE_URL"],
        temperature=0.3,
        timeout=300,
        stream=True,
    )

def build_crew(llm):
    from crewai import Agent, Crew, Process, Task
    researcher = Agent(role="Researcher", goal="Answer the user's question",
                       backstory="You are a helpful researcher.", llm=llm, verbose=False)
    task = Task(description="Answer the user's question: {message}",
                expected_output="A clear, concise answer", agent=researcher)
    return Crew(agents=[researcher], tasks=[task],
                process=Process.sequential,
                memory=False,              # ⭐ use ctx.store instead
                verbose=False)             # ⭐ events flow through event_bus

async def event_stream(ctx, message) -> AsyncIterator[bytes]:
    env = ctx.env                          # ⭐ context.env, never os.environ
    crew = build_crew(get_llm(env))
    # ⭐ crew.kickoff is blocking → offload to a thread
    task = asyncio.create_task(asyncio.to_thread(crew.kickoff, inputs={"message": message}))
    while True:
        if ctx.request.signal.is_set():    # ⭐ Python: .is_set(), not .aborted
            break
        done, _ = await asyncio.wait(
            {task, asyncio.create_task(_queue_get())},
            return_when=asyncio.FIRST_COMPLETED, timeout=5,
        )
        yield ctx.utils.sse({"type": "ping", "ts": int(asyncio.get_event_loop().time() * 1000)})
        for d in done:
            if d is task:
                final = d.result()
                yield ctx.utils.sse({"type": "ai_response", "content": str(final)[:2000]})
                yield b"data: [DONE]\n\n"
                return

async def _queue_get():
    # placeholder for event_bus queue; extend with CrewProgressBridge if streaming tokens
    await asyncio.sleep(3600)

async def handler(ctx):
    body = getattr(getattr(ctx, "request", None), "body", None) or {}
    message = (body.get("message") or "").strip()
    if not message:
        return {"status_code": 400, "body": {"error": "Missing message"}}
    return ctx.utils.stream_sse(event_stream(ctx, message))
```

`edgeone.json`:
```json
{
  "buildCommand": "",
  "outputDirectory": "",
  "agents": { "framework": "crewai" }
}
```

`requirements.txt`:
```txt
crewai>=1.14.5
openai>=1.50.0
```

> For tool streaming, subscribe to `crewai_event_bus` `LLMStreamChunkEvent` → `ai_response` and `TaskCompletedEvent` → `tool_result` (see [makers-agents python-frameworks/crewai.md](../../makers-agents/references/python-frameworks/crewai.md) §6). For platform tools use `ctx.tools.to_crewai_tools(BaseTool)`.

---

## Conversion Checklist

| Native CrewAI | Makers |
|---------------|--------|
| `LLM(model="gpt-4o", api_key=os.environ["OPENAI_API_KEY"])` | `LLM(model=env AI_GATEWAY_MODEL, provider="openai", api_key=ctx.env["AI_GATEWAY_API_KEY"], base_url=ctx.env["AI_GATEWAY_BASE_URL"])` |
| LiteLLM default dispatch | `provider="openai"` (mandatory — platform has no LiteLLM) |
| `crew.kickoff()` blocking | `asyncio.to_thread(crew.kickoff, ...)` |
| `verbose=True` | `verbose=False` |
| `memory=True` | `memory=False` + `ctx.store` |
| Flask `@app.post` + `jsonify` | `async def handler(ctx):` + `ctx.utils.stream_sse(gen())` |
| `os.environ` | `ctx.env` |
| No SSE | `ctx.utils.sse({type,...})` + `data: [DONE]\n\n` + `ping` heartbeat |

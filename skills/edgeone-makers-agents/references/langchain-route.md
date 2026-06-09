# Route A: LangChain direct (langchain + deepagents)

> Reference template: `content-creator-edgeone`
> Use cases: text generation, lightweight tool calls, low-token-cost scenarios.
> Core pattern: `initChatModel` → `bindTools` → manual multi-turn loop → streaming SSE.

---

## When to use Route A

✅ Good fit:
- Mostly "call the model + occasionally invoke one or two tools + stream text out"
- Want precise control over token cost (manual loop with bounded iterations)
- No sandboxed code execution, no complex session needed

❌ Not a fit:
- Need a sandbox to run code / process uploaded files → use Route B
- Need multi-turn session memory → use Route B

---

## Core pattern breakdown

### 1. Model initialization (from `_shared.ts`)
See section 3 (`createModel`) of `platform-conventions.md`. Key points:
- `initChatModel(MODEL_NAME, { modelProvider:'openai', apiKey, configuration:{ baseURL } })`
- Cache instances by baseURL
- `timeout` defaults to 300s

### 2. Tool definition (binding the platform `web_search`)
```typescript
import { tool } from 'langchain';
import { z } from 'zod';

function createSearchTool(contextTools: any) {
  // Pull web_search from the platform tool registry
  // ⚠️ Using web_search → the project must have WSA_API_KEY configured
  //   Console: https://console.cloud.tencent.com/wsapi/index
  //   Docs: https://cloud.tencent.com/document/product/1806/130615
  const webSearchTool = contextTools?.get?.('web_search');

  return tool(
    async ({ query }: { query: string }) => {
      if (webSearchTool) {
        try {
          const result = await webSearchTool.execute({ query, maxResults: 5 });
          const text = typeof result === 'string' ? result : JSON.stringify(result);
          return text.slice(0, 2000);
        } catch (e) {
          // Fall back to placeholder results so the chain doesn't crash
          // Common failures: WSA_API_KEY missing (401), sandbox cold start, network timeout
        }
      }
      return `[1] ${query} related results...\n[2] ...\n[3] ...`;
    },
    {
      name: 'search_web',
      description: 'Search the web. Call ONCE before writing.',
      schema: z.object({ query: z.string().describe('Search query') }),
    }
  );
}
```
> **Principle**: prefer the real capability injected via `context.tools`; when the platform tool is unavailable, degrade to a placeholder/fallback to keep things working.
>
> ⭐ **`web_search` requires the `WSA_API_KEY` environment variable** (peer of `AI_GATEWAY_API_KEY`, read by the sandbox runner). Create an API key in the [Tencent Cloud Web Search API console](https://console.cloud.tencent.com/wsapi/index) → copy the value → set `WSA_API_KEY=<value>` in the EdgeOne project's environment variables (see https://cloud.tencent.com/document/product/1806/130615). The same applies when search is implicitly included via `context.tools.all()`.

### 3. Manual `bindTools` loop (the core)
```typescript
import { HumanMessage, AIMessage, ToolMessage as LCToolMessage } from '@langchain/core/messages';

async function* eventStream(
  modelInstance: any,
  userMessage: string,
  contextTools: any,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const searchTool = createSearchTool(contextTools);
  const tools = [searchTool];
  const toolMap: Record<string, any> = { search_web: searchTool };

  try {
    const modelWithTools = modelInstance.bindTools(tools);
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      new HumanMessage(userMessage),
    ];
    let searchDone = false;

    // ⭐ The loop must have a hard cap (here, max 4 rounds)
    for (let i = 0; i < 4; i++) {
      if (signal?.aborted) break;

      // After search completes, switch back to the no-tools model to avoid repeat tool calls
      const activeModel = searchDone ? modelInstance : modelWithTools;
      const stream = await activeModel.stream(messages);

      let fullContent = '';
      let toolCalls: any[] = [];

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const msg = chunk as any;

        // Accumulate tokens (collect both metadata sources)
        if (msg?.usage_metadata) {
          totalInputTokens += msg.usage_metadata.input_tokens || 0;
          totalOutputTokens += msg.usage_metadata.output_tokens || 0;
        }
        if (msg?.response_metadata?.usage) {
          totalInputTokens += msg.response_metadata.usage.prompt_tokens || 0;
          totalOutputTokens += msg.response_metadata.usage.completion_tokens || 0;
        }

        // Accumulate tool_call chunks
        if (msg?.tool_call_chunks?.length) {
          for (const tc of msg.tool_call_chunks) {
            if (tc.index !== undefined) {
              while (toolCalls.length <= tc.index) toolCalls.push({ name: '', args: '' });
              if (tc.name) toolCalls[tc.index].name = tc.name;
              if (tc.args) toolCalls[tc.index].args += tc.args;
              if (tc.id) toolCalls[tc.index].id = tc.id;
            }
          }
        }

        // Streaming text: only emit after search completes (pre-search may be reasoning/DSML noise)
        if (msg?.text) {
          fullContent += msg.text;
          if (searchDone) {
            const cleaned = stripDSML(msg.text).replace(/\n{3,}/g, '\n\n');
            if (cleaned) yield sseEvent({ type: 'ai_response', content: cleaned });
          }
        }
      }

      // Model wrote the full body directly (no tool calls)
      if (fullContent && toolCalls.length === 0) {
        if (!searchDone) {
          const cleaned = stripDSML(fullContent).replace(/\n{3,}/g, '\n\n');
          if (cleaned) yield sseEvent({ type: 'ai_response', content: cleaned });
        }
        break;
      }

      // Tool calls present: execute tools → append ToolMessage → continue the loop
      if (toolCalls.length > 0) {
        const aiMsg = new AIMessage({
          content: fullContent || '',
          tool_calls: toolCalls.filter(tc => tc.name).map(tc => ({
            name: tc.name,
            args: JSON.parse(tc.args || '{}'),
            id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          })),
        });
        messages.push(aiMsg);

        for (const tc of aiMsg.tool_calls || []) {
          yield sseEvent({ type: 'tool_call', name: tc.name });
          const toolFn = toolMap[tc.name];
          if (toolFn) {
            const result = await toolFn.invoke(tc.args);
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            yield sseEvent({ type: 'tool_result', name: tc.name, content: resultStr.slice(0, 500) });
            messages.push(new LCToolMessage({ content: resultStr, tool_call_id: tc.id || '' }));
          }
        }
        searchDone = true;
        continue;
      }
      break;
    }
  } catch (e: unknown) {
    const error = e as Error;
    if (error.name === 'AbortError' || signal?.aborted) {
      // Normal abort
    } else if (error.message?.includes('terminated')) {
      // Runtime terminated the stream, stay silent
    } else {
      yield sseEvent({ type: 'error_message', content: error.message });
    }
  }

  // Wrap up: token usage + DONE
  yield sseEvent({ type: 'usage', input_tokens: totalInputTokens, output_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens });
  yield 'data: [DONE]\n\n';
}
```

### 4. DSML cleanup helper (common with the DeepSeek family)
```typescript
// DeepSeek-style models occasionally leak tool-call markers / reasoning text into the body — clean them
function stripDSML(text: string): string {
  return text
    .replace(/<\/?｜｜DSML｜｜[^>]*>/g, '')           // Full-width pipe variant
    .replace(/<\/?[|][|]DSML[|][|][^>]*>/g, '')        // ASCII pipe variant
    .replace(/<\/?(tool_calls|invoke|parameter)[^>]*>/g, ''); // Standard XML tags
}
```
> **Principle**: when using `@makers/deepseek-*` models, always `stripDSML` before emitting body text — otherwise the frontend will see junk markers like `<invoke>`.

### 5. `onRequest` entry assembly
```typescript
export async function onRequest(context: any) {
  const { request, env, tools: contextTools } = context;
  const { message, topic, keywords, style, length, outline } = request?.body ?? {};

  // Compose userMessage (supports structured parameters)
  let userMessage = message || '';
  if (topic) {
    userMessage = `Create an article about: "${topic}"`;
    if (keywords) userMessage += `\nTarget keywords: ${keywords}`;
    if (style) userMessage += `\nWriting style: ${style}`;
    if (length) userMessage += `\nTarget length: ${length}`;
    if (outline?.sections) {
      userMessage += `\n\nFollow this outline:\nTitle: ${outline.title}`;
      for (const section of outline.sections) {
        userMessage += `\n- ${section.heading}: ${(section.keyPoints || []).join('; ')}`;
      }
    }
  }
  if (!userMessage) return new Response('Missing message or topic', { status: 400 });

  const signal = request?.signal as AbortSignal | undefined;

  let modelInstance;
  try {
    // ⭐ Always read env from context.env, never from process.env
    modelInstance = await createModel(getAgentEnv(env));
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Wrap with the shared createSSEResponse (recommended), or use an inline ReadableStream
  return createSSEResponse(
    (sig) => eventStream(modelInstance, userMessage, contextTools, sig),
    signal,
  );
}
```

> ⚠️ Note: `getAgentEnv(env)` in `agents/_model.ts` reads from the passed-in `env` (originating from `context.env`); **do not** add `process.env.X` fallbacks. `process.env` is only allowed in the frontend `app/`.

---

## Differences from other routes

| Aspect | Route A (LangChain) | Route B (`claude-sdk-route.md`) | Route C (`openai-agents-route.md`) | Route D (`langgraph-deepagents-route.md`) | Route E (`crewai-route.md`) |
| --- | --- | --- | --- | --- | --- |
| Loop control | Manual `for i<N` | SDK-managed session | Agent runner | Graph state machine | Multi-agent crew |
| Tool execution | `bindTools` + manual dispatch | Sandbox-native | OpenAI Agents tools | Node-level tools | Per-agent tools |
| Sandbox/files | Not used | First-class | Optional | Optional | Optional |
| Session memory | Stateless per request | SDK session | Manual | Graph checkpoints | Crew context |
| Token cost | Lowest, easy to bound | Higher | Medium | Medium-high | Highest |

See also: `sandbox-and-tools.md`, `review-checklist.md`, `memory-store.md`, `framework-native-patterns.md`.

---

## Route A review checklist
- [ ] Loop has a hard cap (`for i<N`)
- [ ] No text emitted before search completes (avoid leaking reasoning/DSML)
- [ ] `stripDSML` applied to every `ai_response`
- [ ] Token accounting accumulates from both metadata sources
- [ ] Tools prefer `context.tools` with a fallback path
- [ ] AbortSignal checked both inside the loop and inside the stream
- [ ] Errors classified (AbortError/terminated stay silent, others emit `error_message`)
- [ ] `env` always from `context.env`; `process.env` is forbidden
- [ ] ⭐ Frontend calls include the `makers-conversation-id` header

---

## Frontend call example

```typescript
// app/page.tsx or app/lib/api.ts
const conversationId = getOrCreateConversationId();   // UUID cached in localStorage

const resp = await fetch('/create', {                // Typical Route A endpoint
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'makers-conversation-id': conversationId,         // ⭐ Required
  },
  body: JSON.stringify({ topic, keywords, style, length }),
});
// Then parse SSE: ai_response / tool_call / tool_result / usage / [DONE]
```

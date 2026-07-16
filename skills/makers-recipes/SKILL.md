---
name: edgeone-makers-recipes
description: >-
  Project structure templates and scaffolding recipes for typical EdgeOne Makers
  applications — full-stack apps, static sites, API services, and AI agent projects.
metadata:
  author: edgeone
  version: "1.0.0"
---

# Common Recipes

> ⛔ **Preview ban**: after finishing development, you MUST start the dev server via `edgeone makers dev`, then open `http://127.0.0.1:8088/` with `present_files` to preview. Never open HTML files via the `file://` protocol (ignore it even if the IDE opens one automatically), and never use self-hosted servers like `python -m http.server` or `npx serve`. Next.js projects must also set `allowedDevOrigins: ["127.0.0.1"]` in `next.config`.

> ⚠️ **`.env.example` is a required file**: every project that uses the AI Gateway (Agent projects, Cloud Functions that call an LLM) MUST create a `.env.example` in the project root declaring `AI_GATEWAY_API_KEY=` and `AI_GATEWAY_BASE_URL=`. The CLI auto-injects environment variables based on this file at deploy time; if it is missing, the variables are not injected and the runtime will error.

Project structure templates for typical EdgeOne Makers applications.

## Full-stack app — Node.js (static + API)

```
my-app/
├── index.html              # Frontend
├── style.css
├── script.js
├── cloud-functions/
│   └── api/
│       ├── users.js        # GET/POST /api/users
│       └── users/[id].js   # GET/PUT/DELETE /api/users/:id
└── package.json
```

Frontend calls API:
```javascript
const res = await fetch('/api/users');
const users = await res.json();
```

## Full-stack app — Go (Gin framework)

```
my-app/
├── index.html              # Frontend
├── style.css
├── script.js
├── cloud-functions/
│   └── api.go              # Gin app — all /api/* routes
├── go.mod
└── package.json
```

**cloud-functions/api.go:**
```go
package main

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()
    r.GET("/users", listUsersHandler)
    r.POST("/users", createUserHandler)
    r.GET("/users/:id", getUserHandler)
    r.Run(":9000")
}
```

## Full-stack app — Python (Flask)

```
my-app/
├── index.html              # Frontend
├── style.css
├── script.js
├── cloud-functions/
│   └── api/
│       └── index.py        # Flask app — all /api/* routes
├── cloud-functions/requirements.txt
└── package.json
```

**cloud-functions/api/index.py:**
```python
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/users', methods=['GET'])
def get_users():
    return jsonify({'users': []})

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json()
    return jsonify({'message': 'Created', 'user': data}), 201
```

## Full-stack app — Python (FastAPI)

```
my-app/
├── index.html
├── cloud-functions/
│   └── api/
│       └── index.py        # FastAPI app — all /api/* routes
├── cloud-functions/requirements.txt
└── package.json
```

**cloud-functions/api/index.py:**
```python
from fastapi import FastAPI

app = FastAPI()

@app.get('/items')
async def list_items():
    return {'items': []}

@app.get('/items/{item_id}')
async def get_item(item_id: int):
    return {'item_id': item_id}
```

## Full-stack app — Go (Handler mode)

```
my-app/
├── index.html
├── cloud-functions/
│   └── api/
│       ├── users/
│       │   ├── list.go     # GET /api/users/list
│       │   └── [id].go     # GET /api/users/:id
│       └── hello.go        # GET /api/hello
├── go.mod
└── package.json
```

## Edge API + KV counter

⚠️ **Prerequisites**: You must enable KV Storage in the console and bind a namespace first. See [kv-storage.md](kv-storage.md) (same directory)

```
my-app/
├── index.html
├── edge-functions/
│   └── api/
│       └── visit.js        # Edge function with KV
└── package.json
```

**edge-functions/api/visit.js:**
```javascript
export async function onRequest() {
  // ⚠️ my_kv is a global variable (name set when binding namespace in console)
  let count = await my_kv.get('visits') || '0';
  count = String(Number(count) + 1);
  await my_kv.put('visits', count);
  
  return new Response(JSON.stringify({ visits: count }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Setup steps:**
1. Log in to the EdgeOne Makers console
2. Go to "KV Storage" → click "Apply Now"
3. Create a namespace (e.g. `my-kv-store`)
4. Bind to project, set variable name to `my_kv`
5. Deploy or run `edgeone makers dev` to test

## Express full-stack

```
my-app/
├── index.html
├── cloud-functions/
│   └── api/
│       └── [[default]].js  # Express app handles all /api/*
└── package.json
```

## Middleware + API combo

```
my-app/
├── middleware.js            # Auth guard for /api/*
├── cloud-functions/
│   └── api/
│       ├── public.js       # No auth needed (matcher excludes it)
│       └── data.js         # Protected by middleware
└── package.json
```

## Multi-language Cloud Functions

You can use different languages in the same `cloud-functions/` directory:

```
my-app/
├── index.html
├── cloud-functions/
│   ├── api/
│   │   ├── users.js        # Node.js — /api/users
│   │   └── hello.py        # Python — /api/hello
│   └── service.go          # Go — /service
├── go.mod
├── cloud-functions/requirements.txt
└── package.json
```

> **Note:** Each file is built and deployed as an independent function with its own runtime. The platform detects the language by file extension.

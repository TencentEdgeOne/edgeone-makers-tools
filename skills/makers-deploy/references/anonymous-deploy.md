# Anonymous Deploy & Claim Reference

Detail reference for login-free deployment. For the decision flow and the commands to run, see [SKILL.md](../SKILL.md) — read that first.

Requires CLI `>= 1.6.21`.

---

## Commands

```bash
# Anonymous deploy (only takes effect when NOT logged in)
edgeone makers deploy --anonymous [--site china|global] [--json]

# Claim an anonymous project into your account (requires login)
edgeone makers claim [--sid <anonymous-token>] [-t <api-token>] [--json]
```

### Deploy parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `--anonymous` | boolean | Enables login-free deploy. **Ignored when already logged in** — the CLI prints a notice and runs the normal deploy flow. **No `-a` short option exists** (`-a` is already taken by `--area`). |
| `--site` | `china` \| `global` | Which API site to use. Auto-detected by egress IP when omitted. |
| `--json` | boolean | Emit a machine-readable result line. |

### Claim parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `--sid` | string | The **anonymous identity token** from deploy output. Optional when `.edgeone/anonymous.json` exists in the working directory. |
| `-t` / `--token` | string | The **account API token** for authentication. A completely different thing from `--sid`. |
| `--json` | boolean | Emit a machine-readable result line. |

⛔ **`--sid` and `-t` are not interchangeable.** `--sid` identifies the anonymous project to claim; `-t` authenticates the account receiving it. Product documentation that says `claim --token <anonymous-token>` is wrong.

### Parameters silently ignored under `--anonymous`

Do not pass these — they have no effect and will mislead the user:

| Parameter | Why it is ignored |
|-----------|-------------------|
| `-n` / `--name` | The project name is generated automatically: current directory name (lowercased, non-alphanumerics replaced with `-`) plus an 8-character random suffix. Users cannot choose it. |
| `-e` / `--env` | The anonymous path does not take an environment argument. |
| `--area` | Not forwarded by the anonymous deploy path. |

---

## Parsing `--json` output

⚠️ Field names are **camelCase**. Product documentation shows snake_case (`site_url`, `project_id`, `claim_url`) — that is incorrect. Use the names below.

📌 Human-readable output is printed **before** the JSON. Parse the **last line** of stdout, exactly as for a normal deploy. Do not assume all of stdout is JSON. This applies to failures too.

### Success

```json
{
  "status": "success",
  "url": "https://my-app-a3f8b2c1.edgeone.dev",
  "projectId": "makers-ihtxkls1k3jc",
  "deploymentId": "dppxfikip2rt",
  "anonymousToken": "98a71090aaae2670c6fe0024a250d6f3",
  "claimUrl": "https://console.tencentcloud.com/edgeone/pages/claim?token=98a71090aaae2670c6fe0024a250d6f3",
  "claimCommand": "edgeone makers claim --sid 98a71090aaae2670c6fe0024a250d6f3",
  "expiresAt": "2026-07-28T21:10:48.000Z",
  "site": "global"
}
```

| Field | Meaning |
|-------|---------|
| `url` | Live access URL. Present it exactly as returned, never truncated — if it carries a query string, keep the whole thing. |
| `projectId` | Anonymous project ID. |
| `deploymentId` | Deployment ID. |
| `anonymousToken` | Anonymous identity token (the Sid). Needed to claim. |
| `claimUrl` | Web claim URL, on the console domain matching `site`. **This is what you show the user** — a clickable link. |
| `claimCommand` | Ready-to-run CLI claim command. **For you to execute, never to display** — see the note below. |
| `expiresAt` | **Actual** claim deadline, ISO 8601. Always show this value; never substitute a hardcoded duration. Omitted when the backend returns no usable expiry timestamp — in that case say the deadline is unknown and advise claiming promptly, and still never invent a duration. |
| `site` | `china` or `global` — the API site this project lives on. |

### Failure

```json
{"status":"error","errorCode":"RATE_LIMIT_EXCEEDED","message":"...","suggestion":"..."}
```

`suggestion` is only present for the rate-limit case. `errorCode` may be absent for generic failures.

⛔ **Never print `claimCommand` to the user.** Sandboxed IDEs (WorkBuddy and similar) give the user no terminal, so they cannot run it — and non-technical users cannot read it anyway. Show the `claimUrl` link and offer to run the claim yourself. `claimCommand` exists for **you** to execute.

---

## Three different expiry windows — do not conflate them

| Window | Where it comes from | What it governs |
|--------|--------------------|-----------------|
| **Anonymous token validity** | `expiresAt` in `--json` output | The claim deadline. This is the only one users care about. |
| COS credential validity | `cosExpiredTime` / `cosExpiration` in the state file | A single upload operation. Irrelevant once deploy succeeds. |
| Product target spec | TAPD requirement (unclaimed 60 min → 24 h after claim, 3 renewals) | Not implemented in the current backend. Do not quote it to users. |

⛔ **Never hardcode a duration.** Both the product plan and the CLI implementation doc state "60 minutes", but measured responses contradict this: in the recorded test-environment response the anonymous token lasted ~12 hours and the COS credential 30 minutes. Read `expiresAt` and show that.

When you have not yet run the deploy (for example while asking the user whether to go anonymous), use wording with no number: "you'll need to log in and claim it before it expires; the exact deadline is shown once the deploy finishes".

---

## Local state file: `.edgeone/anonymous.json`

Written to `<cwd>/.edgeone/anonymous.json`.

| Field | Meaning |
|-------|---------|
| `site` | API site (`china` / `global`). Reused by `claim`. |
| `token` | Anonymous identity token (Sid). |
| `tokenExpired` | Token expiry, Unix seconds. |
| `projectName`, `projectId`, `deploymentId` | Project and deployment identifiers. |
| `targetPath`, `bucket`, `region` | COS upload location. `region` is a COS storage region (e.g. `ap-shanghai`) — **not** the API site. |
| `cosExpiredTime`, `cosExpiration` | COS credential expiry. |
| `siteUrl` | Live URL. |
| `createdAt` | Creation timestamp, ISO 8601. |

Lifecycle:

- Written incrementally as the deploy progresses.
- **Deleted on successful claim.**
- **Kept on failure**, so a retry or a later claim can still find the token.
- When present, `claim` needs no `--sid`.

Treat it as a secret: it holds an ephemeral credential, valid until claimed or expired. It lives under `.edgeone/`, which projects normally already ignore in git — confirm that before committing.

---

## Site resolution (`--site`)

| Situation | Behaviour |
|-----------|-----------|
| `--site` passed | Used as-is. Prefer this in Agent/CI contexts for determinism. |
| `--site` omitted | Detected via `GET https://api.edgeone.ai/e-func/ip/isCN` (3 s timeout): `isCN: true` → `china`, otherwise `global`. |
| Detection fails | Falls back to `global`. |

`claim` reads `site` from `.edgeone/anonymous.json` and **does not re-detect by IP** — the token and project are bound to one site, and egress IP can change between commands (VPN, different CI runner).

China and Global are fully independent environments: tokens and projects do not cross over. If the site is wrong, the claim fails.

> **China site status:** availability depends on backend anonymous-account configuration being in place for the China site. Confirm before relying on `--site china`. Note also that mainland-China access to preview links may be restricted by local regulations.

---

## Rate limits

Anonymous deploys are rate-limited on **two dimensions — egress IP and Sid** — resetting daily at 00:00 local time.

Exact allowances are not documented consistently across sources, so they are deliberately not stated here. Treat the limit as reachable and handle it.

When exceeded, the CLI reports `LimitExceeded.Upload`, exits non-zero, and with `--json` emits:

```json
{"status":"error","errorCode":"RATE_LIMIT_EXCEEDED","message":"Daily anonymous deploy limit reached.","suggestion":"Please login (edgeone login) to deploy without limits, or try again tomorrow."}
```

Correct response: tell the user the anonymous quota is used up, and offer logging in (no quota) or retrying tomorrow. Do not retry in a loop.

---

## Error reference

### Deploy

| Symptom | Cause | Action |
|---------|-------|--------|
| `errorCode: RATE_LIMIT_EXCEEDED` / `LimitExceeded.Upload` | Daily anonymous quota exhausted | Offer login, or retry tomorrow. Do not loop. |
| `errorCode: TOKEN_EXPIRED` / CGI `code: 104` | Anonymous token expired or unknown | Run the anonymous deploy again — it mints a fresh token. |
| `InvalidParameter.Security` | Generated project name collided or was rejected | Retry; a new random suffix is generated each run. |
| `COS upload failed: ...` | Network or credential failure during upload | Retry the deploy. COS credentials are short-lived, so a stale run cannot be resumed. |
| `Deployment polling timed out after 5 minutes` | Build did not reach a terminal state in time | Retry. Polling runs every 3 s for up to 5 minutes. |
| `Deployment failed: <mapped message>` | Remote build failed | Read the mapped message (e.g. `Build script error`, `Install failed`, `Memory exceed limit`, `Time exceed limit`) and fix the project's build. |
| `Detected logged-in account, --anonymous is ignored` | Credentials were found | Expected. The normal deploy flow runs instead. |

Deployment status values: `Success` is terminal-success; `Failed`, `Timeout`, `Cancelled` are terminal-failure; anything else keeps polling.

### Claim

| Symptom | Cause | Action |
|---------|-------|--------|
| `MISSING_TOKEN` | No `--sid` and no state file | Pass `--sid <token>`, or run from the directory containing `.edgeone/anonymous.json`. |
| `Claim API error (Code 108)` | Not authenticated | Log in, or pass `-t <api-token>`. |
| `Claim returned no succeeded projects` | Token expired, already claimed, or no deployment in `Success` state | Verify the deploy finished successfully and the token is still valid. |
| Warning about a site mismatch | Credentials belong to a different site than the deploy | Re-run with credentials for the site named in the warning. |
| `ResourceUnavailable` | Account restricted | Surface the message; nothing the CLI can do. |

The backend claims **asynchronously** and only migrates projects whose deployment reached `Success`. A response is only a real success when its `succeeded` array is non-empty — the CLI already enforces this. Always claim after the deploy has finished, never during.

---

## Claim flow

Two independent routes. Pick by who acts:

**Route A — the user claims in the browser (default, and the only one to advertise).** Give them the `claimUrl` link. They sign in and the project transfers. Nothing to run.

**Route B — you claim on their behalf**, when the user says "claim it" or is already logged in:

1. **Deploy must have succeeded.** Only `Success` deployments are migrated.
2. **Log in.** In an interactive environment the CLI opens a browser when needed; in CI, pass `-t <api-token>`.
3. **Match the site.** Run from the directory holding `.edgeone/anonymous.json` so the site is reused, or ensure your credentials match the deploy's site.
4. **Run the claim** — you execute this, never hand it to the user:
   ```bash
   edgeone makers claim --sid <anonymous-token> --json
   # or, with the state file present:
   edgeone makers claim --json
   ```
5. **On success** the CLI prints the project name, ID, and URL, then deletes `.edgeone/anonymous.json`. The project is now permanent and managed with the normal `edgeone makers deploy` flow. Relay the project name and URL in plain language; do not paste the JSON.

---

## Why Agent and storage projects must log in instead

The anonymous deploy path builds with an empty environment: it calls the build with `ENV_STR: "{}"` and **skips both remote environment-variable pull and AI-gateway credential injection**, because those calls require authentication that an anonymous session does not have.

Consequences:

| Project type | Anonymous result |
|--------------|------------------|
| Static site / frontend framework | Works correctly. |
| Project with `agents/` (AI Agent endpoints) | Site loads, but AI conversations fail — no model credentials. |
| Project importing `@edgeone/pages-blob`, or bound to a KV namespace | Site loads, but storage calls fail — Blob reports `Missing: deployCredential`, and a KV global is undefined because an anonymous project has no namespace binding. |

A site that loads but breaks on first interaction is worse than an explicit login prompt, so route these project types to login. Detection and wording are in [SKILL.md](../SKILL.md).

⚠️ Blob is detectable by grepping for its package import; **KV is not**. A KV namespace is bound in the console and surfaces as a global variable whose name the user chose, so there is no import to find and there is no `@edgeone/pages-kv` package. Ask the user whether the project uses KV rather than relying on a search.

---

## Agent / CI workflow example

```bash
export PAGES_SOURCE=skills

# 1. Not logged in, and this is a plain frontend project
edgeone makers deploy --anonymous --json
# → last stdout line is the JSON result

# 2. Verify the deployment is live
curl -sSI "<url from the json>" | head -1

# 3. Later, once the user has an account
edgeone login --site global
edgeone makers claim --json     # reads .edgeone/anonymous.json
```

Present all three of these to the user together after an anonymous deploy — the URL alone is not enough, because an unclaimed project expires:

1. the full access URL,
2. the `claimUrl` as a clickable link, plus an offer to run the claim for them (**never** the `claimCommand` itself),
3. the actual `expiresAt` value, and that the project is lost if unclaimed.

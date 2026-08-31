# Anonymous Deploy & Claim Reference

Detail reference for login-free deployment. For the decision flow and the commands to run, see [SKILL.md](../SKILL.md) — read that first.

Requires CLI `>= 1.6.29`.

## Contents

- [Commands](#commands)
- [Parsing `--json` output](#parsing---json-output)
- [What to tell the user about the deadline](#what-to-tell-the-user-about-the-deadline)
- [Local state file: `.edgeone/anonymous.json`](#local-state-file-edgeoneanonymousjson)
- [What NOT to promise about claiming](#what-not-to-promise-about-claiming)
- [Site resolution (`--site`)](#site-resolution---site)
- [Rate limits](#rate-limits)
- [Error reference](#error-reference)
- [Claim flow](#claim-flow)
- [Why Agent and storage projects must log in instead](#why-agent-and-storage-projects-must-log-in-instead)
- [Agent / CI workflow example](#agent--ci-workflow-example)


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
| `--site` | `china` \| `global` | Which API site to use. **The CLI auto-detects by egress IP when omitted** — you do not need to probe it yourself. |
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
  "url": "https://my-app-a3f8b2c1.edgeone.dev?eo_token=abc123&eo_time=1234567890",
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
| `url` | Live access URL. The CLI requests it signed (`NeedVisit: true`), so it arrives with `?eo_token=...&eo_time=...` — that signature is what makes it openable, including on the China site. Present it exactly as returned, never truncated. |
| `projectId` | Anonymous project ID. |
| `deploymentId` | Deployment ID. |
| `anonymousToken` | Anonymous identity token (the Sid). Needed to claim. |
| `claimUrl` | Bare web claim URL. ⛔ **Do NOT present this to the user** — claiming through it leaves the CLI unaware, and the next deploy would create a second anonymous project. The user-facing claim link is the `claimLoginUrl` from `edgeone login --claim` (see Claim flow). |
| `claimCommand` | Ready-to-run CLI claim command. **For you to execute, never to display** — see the note below. |
| `expiresAt` | Token expiry as an ISO 8601 timestamp, when the backend returns one. **Do not show this to the user** — tell them to claim within 60 minutes (see below). Useful to you for diagnostics. May be absent. |
| `site` | `china` or `global` — the API site this project lives on. |

### Failure

```json
{"status":"error","errorCode":"RATE_LIMIT_EXCEEDED","message":"...","suggestion":"..."}
```

`suggestion` is only present for the rate-limit case. `errorCode` may be absent for generic failures.

⛔ **Never print `claimCommand` to the user.** Sandboxed IDEs (WorkBuddy and similar) give the user no terminal, so they cannot run it — and non-technical users cannot read it anyway. The claim link you show comes from `edgeone login --claim`. `claimCommand` is a fallback for headless/CI environments with no browser, executed by you, never displayed.

---

## What to tell the user about the deadline

**Tell them the link expires in 60 minutes unless they claim it.** Frame it as the *link expiring*, not as the project being deleted — from the user's point of view what they lose is a working URL, and "your project will be removed" reads as data loss, which is needlessly alarming.

Convey that meaning in the user's own language. The English wording here specifies intent, not a string to copy.

Do **not** show the raw `expiresAt` timestamp, and do not derive a different duration from it.

Why 60 minutes and not the timestamp: `expiresAt` reflects only the anonymous **token's** lifetime, which in a recorded test-environment response was ~12 hours — longer than 60 minutes. But token lifetime is not the same as the usable window. The unclaimed link is also bounded by visitor-count and IP restrictions that can cut access short, and the product spec's window is 60 minutes. Quoting a 12-hour timestamp would therefore over-promise. Quoting 60 minutes is safe in both directions.

Three distinct windows exist — do not conflate them:

| Window | Where it comes from | What it governs |
|--------|--------------------|-----------------|
| Claim window | Product spec: **60 minutes** | What you tell the user. |
| Anonymous token validity | `expiresAt` in `--json` output | The token itself. Diagnostics only; not user-facing. |
| COS credential validity | `cosExpiredTime` / `cosExpiration` in the state file | A single upload operation. Irrelevant once deploy succeeds. |


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

## What NOT to promise about claiming

Claiming moves the project into the user's account. That is all it does. Say that, and stop.

| ❌ Do not say | Why it is wrong |
|---|---|
| "permanently yours" / "no time limit or access restrictions" | A claimed project's preset URL is still a preview-grade domain. Mainland-China access can be restricted (e.g. 401) depending on ICP filing status and CDN policy — claiming does not change that. |
| "unlimited" / "fully public now" | Overstates it. Stable public access generally needs a custom domain, and in mainland China a filing. |
| Anything about custom domains, ICP filing, DNS, or console navigation | Correct, but wrong moment. The user is deciding whether to claim, or has just claimed. Front-loading these concepts onto someone who wanted a live URL is exactly the confusion the anonymous flow exists to avoid. The claim page owns that flow. |

Raise domains or filing **only** when the user asks about stable / production / shareable access. The normal-deploy path in [SKILL.md](../SKILL.md) already has the correct ICP wording for that case.

---

## Site resolution (`--site`)

**The CLI resolves the site by itself, inside its own process.** You do not need to detect anything.

| Situation | Behaviour |
|-----------|-----------|
| `--site` passed | The CLI uses it as-is and skips detection. Prefer this in Agent/CI contexts for determinism. |
| `--site` omitted | **The CLI itself** issues `GET https://api.edgeone.ai/e-func/ip/isCN` (3 s timeout): `isCN: true` → `china`, otherwise `global`. |
| Detection fails | The CLI falls back to `global`. |

⛔ **Do not call the `isCN` endpoint yourself** and do not build `--site` from your own probe. The CLI already does this at `deploy.ts` → `resolveSite()`. Probing yourself is a wasted request, and in a sandboxed IDE your Bash egress IP may differ from the CLI's, so you could force the *wrong* site. Pass `--site` only when you have an independent reason to pin it (the user said which site, or CI must be deterministic).

`claim` reads `site` from `.edgeone/anonymous.json` and **does not re-detect by IP** — the token and project are bound to one site, and egress IP can change between commands (VPN, different CI runner).

China and Global are fully independent environments: tokens and projects do not cross over. If the site is wrong, the claim fails.

> **China site status:** availability depends on backend anonymous-account configuration being in place for the China site. Confirm before relying on `--site china`. An *unsigned* preview link 401s in mainland China  — the signed URL from `NeedVisit: true` is what makes it accessible;

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

**Route A — `edgeone login --claim` (the flow, and the only one you present).** Run it immediately after the anonymous deploy, in the background:

```bash
edgeone login --claim --local --json
```

What it does:

1. Reads `.edgeone/anonymous.json` (fails fast if absent).
2. Starts the login listener on a free port (from 1024) **without opening a browser**.
3. Prints a `{"status":"waiting","claimLoginUrl":"...","port":...,"projectName":"..."}` JSON line immediately, then keeps listening (60-minute timeout, matching the claim window). The URL chains Tencent Cloud login → the claim page (carrying the anonymous token + port + state).
4. The user logs in and claims on that page; the console relays the login state back to the listener after the claim completes.
5. On success the CLI saves credentials (plus `.edgeone/auth.json` with `--local`), waits briefly for the async transfer to become visible, links the project (`.edgeone/project.json`), deletes `.edgeone/anonymous.json`, and exits 0 with `{"status":"success","projectId":...,"projectName":...,"linked":true}`.

If it exits non-zero (timeout / not completed), the anonymous state file is still there — re-run the same command for a fresh link.

The bare `claimUrl` from the deploy JSON bypasses all of this: the project gets claimed but the CLI never learns the login state, never links the project, and the next deploy starts a second anonymous project. Never present it.

**Route B — CLI claim. Fallback only**, for headless/CI environments where no browser exists. Never advertise it, never show the command to the user:

1. **Deploy must have succeeded.** Only `Success` deployments are migrated.
2. **Log in.** In an interactive environment the CLI opens a browser when needed; in CI, pass `-t <api-token>`.
3. **Match the site.** Run from the directory holding `.edgeone/anonymous.json` so the site is reused, or ensure your credentials match the deploy's site.
4. **Run the claim** — you execute this, never hand it to the user:
   ```bash
   edgeone makers claim --sid <anonymous-token> --json
   # or, with the state file present:
   edgeone makers claim --json
   ```
5. **On success** the CLI prints the project name, ID, and URL, then deletes `.edgeone/anonymous.json`. The project now belongs to the account and is managed with the normal `edgeone makers deploy` flow. Relay the project name and URL in plain language; do not paste the JSON, and do not describe what claiming "unlocks" — see the note below.

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

# 3. Start the claim listener in the background right away
edgeone login --claim --local --json
# → first JSON line has claimLoginUrl; process exits 0 once the user claims
```

After an anonymous deploy, present the result using the **fixed template in [SKILL.md](../SKILL.md) Step 4** — do not assemble your own message. Substitute only the URL and the claim link; translate it into the user's language; add nothing.

It carries exactly three things, and that is deliberate: the access URL, the claim link (the `claimLoginUrl` from `login --claim` — never the bare `claimUrl`, never the `claimCommand`), and that the link expires in 60 minutes (**never** the raw `expiresAt` value).

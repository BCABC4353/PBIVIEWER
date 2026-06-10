# Issue Beacon — remote "it's broken" reporting

The issue beacon lets you triage client problems **from your own screen** instead
of asking a non-technical user to find and email a log file. When a client hits a
user-visible failure, the app batches a sanitized summary and posts it to a GitHub
issue thread you own.

## Status: OPT-IN, disabled by default

A normal build transmits **nothing**. The beacon only turns on when a token and
repo are baked in at build time (below). Until then it is a silent no-op.

## What it sends (and never sends)

You chose **codes + names**. Each report line contains:

- the error **code** (e.g. `REPORT_EMBED_ERROR`, `APP_WEBVIEW_ERROR`, `RENDERER_CRASH`)
- the **HTTP status** when there is one
- the affected **item name** (report / dataset / app), capped and sanitized
- the **app version**, **OS platform**, an **anonymous per-install id**, timestamps

It **never** sends: access tokens, JWTs, email addresses, GUIDs (all stripped by
the same redaction the API layer uses), or any **data value** from a report.

> **Regulated data note:** item names are the most sensitive field transmitted.
> If any client's data is regulated (e.g. PHI), build with `BEACON_INCLUDE_NAMES=false`
> to drop names and send codes/counts only. With names off, the beacon cannot leak
> PHI by construction.

## How reports look

One GitHub issue is opened per install (titled `beacon: install <id> (<version>)`),
and subsequent batches are appended as comments — so each machine is one thread you
can read, triage, and close.

## Enabling it

1. Create a **dedicated private repo** for telemetry (e.g. `BCABC4353/pbiviewer-telemetry`).
2. Create a **fine-grained personal access token** scoped to **that repo only**, with
   **Issues: Read and write** — nothing else. (Minimal blast radius if it ever leaks:
   someone could only open issues on the telemetry repo.)
3. Add these as build secrets / env vars when building the release:
   - `BEACON_GH_TOKEN` = the fine-grained token
   - `BEACON_GH_REPO` = `owner/telemetry-repo`
   - `BEACON_INCLUDE_NAMES` = `false` to suppress item names (optional; default sends them)
4. Build. `generate-config` bakes them into a gitignored file; the beacon enables itself.

## Honest trade-off

This is the "no new infrastructure" option you picked: it embeds a minimal-scope
token in the build (obfuscated at rest, like the Azure config). The more secure
alternative — a tiny hosted endpoint the app posts to, with the token kept
server-side — remains available if you later want zero embedded credentials.

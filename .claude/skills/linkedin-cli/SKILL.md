---
name: linkedin-cli
description: "适用于automating linkedin via cli: fetch profiles, search people/companies, send messages, manage connections, create posts, and sales navigator.的情况。"
risk: safe
source: community
date_added: "2026-02-27"
---

## When to Use
Use this skill when you need to automate LinkedIn tasks such as profile fetching, connection management, or post creation via CLI, especially when integrated into automated workflows.

# LinkedIn Skill

You have access to `linkedin` – a CLI tool for LinkedIn automation. Use it to fetch profiles, search people and companies, send messages, manage connections, create posts, react, comment, and more.

Each command sends a request to Linked API, which runs a real cloud browser to perform the action on LinkedIn. Operations are **not instant** – expect 30 seconds to several minutes depending on complexity.

If `linkedin` is not available, install it:

```bash
npm install -g @linkedapi/linkedin-cli
```

## Authentication

If a command fails with exit code 2 (authentication error), ask the user to set up their account:

1. Go to [app.linkedapi.io](https://app.linkedapi.io) and sign up or log in
2. Connect their LinkedIn account
3. Copy the **Linked API Token** and **Identification Token** from the dashboard

Once the user provides the tokens, run:

```bash
linkedin setup --linked-api-token=TOKEN --identification-token=TOKEN
```

### When to Use
Use this skill when you need to **orchestrate LinkedIn actions from scripts or an AI agent** instead of clicking through the web UI:

- Building outreach, research, or recruiting workflows that rely on LinkedIn data and messaging.
- Enriching leads or accounts by fetching people and company profiles in bulk.
- Coordinating multi-step Sales Navigator or workflow runs where JSON output and exit codes are required.

Always respect LinkedIn’s terms of service, local regulations, and your organisation’s compliance policies when using automation against real accounts.

## Global Flags

Always use `--json` and `-q` for machine-readable output:

```bash
linkedin <command> --json -q
```

| Flag                    | Description                             |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 35 MINUTES 25 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE
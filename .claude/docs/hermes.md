# Hermes Setup

This repository ships a Hermes adapter for planning-with-files.

The adapter has two parts:

- `.hermes/skills/planning-with-files/` contains the Hermes-facing workflow skill and its bundled templates/scripts
- `.hermes/plugins/planning-with-files/` contains the project plugin that provides planning tools and context injection

## What the Adapter Provides

- `planning_with_files_init` creates `task_plan.md`, `findings.md`, and `progress.md` in the target project
- `planning_with_files_status` summarizes the current planning state
- `planning_with_files_check_complete` runs the completion check helper
- The project plugin injects active planning context on later turns and reminds the agent to update planning files after write-like actions

## Install

### 1. Enable project plugins

```bash
export HERMES_ENABLE_PROJECT_PLUGINS=1
```

### 2. Install the Hermes skill bundle

Add the skill directory to your Hermes profile. The skill bundle includes `SKILL.md`, `templates/`, and `scripts/`.

```yaml
skills:
  external_dirs:
    - /absolute/path/to/planning-with-files/.hermes/skills
```

### 3. Install the Hermes project plugin

Copy `.hermes/plugins/planning-with-files/` into the target profile or repository so Hermes can load the Python adapter.

### 4. Start Hermes from the target project directory

The project plugin lives under `.hermes/plugins/planning-with-files/`. Hermes discovers it automatically when project plugins are enabled and the working directory is this repository.

## Usage

- Run `/plan` to start the planning workflow in the current project
- Run `/plan-status` to inspect the current planning state
- Load `planning-with-files` directly when you want the workflow instructions without the command wrapper

## Validation

```bash
python3 -m unittest tests/test_hermes_adapter.py
```

## Integration Notes

This section is for users who have installed the Hermes adapter and are
comparing its behavior to hook-native platforms such as Claude Code.

### What works today

The adapter provides reliable support for the following:

- **Initialization.** `planning_with_files_init` creates `task_plan.md`,
  `findings.md`, and `progress.md` in the target project and sets up the
  planning scaffold correctly.
- **Status queries.** `planning_with_files_status` summarizes current planning
  state and surfaces which phases are active or blocked.
- **Completion checks.** `planning_with_files_check_complete` runs the
  completion check helper and returns a structured result the agent can act on.
- **Context injection.** The project plugin injects active planning context on
  later turns and reminds the agent to update planning files after write-like
  actions. This keeps planning state visible across a multi-step workflow.
- **Explicit planning commands.** `/plan` and `/plan-status` work as expected
  when the skill is loaded and the project plugin is active.

### What is not a full equivalent of hook-native platforms

Hermes does not expose a native hook or lifecycle API comparable to the stop
and pre-tool hooks available on Claude Code. The consequences are:

- **Stop/block enforcement is adapter-driven, not platform-native.** On
  Claude Code, a stop hook can interrupt execution at the platform level before
  the agent takes an action. On Hermes, completion checks and blocking
  reminders are delivered as tool responses and context injections. The agent
  can receive and act on them, but there is no platform-level gate that halts
  execution unconditionally.
- **No pre-tool or post-tool lifecycle callbacks.** The project plugin injects
  reminders, but it cannot intercept a tool call mid-flight or force a rollback
  the way a hook middleware can.
- **More manual setup.** Hook-native platforms wire lifecycle callbacks
  automatically once the plugin is installed. On Hermes you must explicitly
  enable project plugins, add the skill bundle to your profile, and start
  Hermes from the correct working directory (see Install above).

If you are migrating from a Claude Code workflow and expecting the same
stop/block behavior you observed there, you will need to adjust your
expectations and your integration pattern accordingly.

### Recommended integration pattern

1. Enable project plugins before starting Hermes
   (`HERMES_ENABLE_PROJECT_PLUGINS=1`).
2. Load the `planning-with-files` skill at the start of each session, either
   via a profile default or an explicit `/load planning-with-files` command.
3. Call `planning_with_files_init` once per project to create the planning
   files. Do not skip this step even if you are resuming an existing project,
   because the plugin uses the presence of these files to decide whether to
   inject context.
4. Rely on the explicit planning tools (`/plan`, `/plan-status`,
   `planning_with_files_check_complete`) as your primary control points rather
   than assuming platform-level enforcement.
5. Treat completion checks as advisory signals. Build your workflow so the
   agent calls `planning_with_files_check_complete` at natural checkpoints and
   acts on the result, rather than expecting the platform to block progress
   automatically.
6. Use context injection as a substitute for hook reminders. The project plugin
   is designed to keep planning discipline visible throughout a conversation.
   If you find the agent drifting from the plan, a manual `/plan-status` call
   will re-anchor it.

### Tradeoffs

| Aspect | Detail |
|---|---|
| Usable today | The adapter covers the core planning workflow without requiring a hook-native platform. |
| Planning discipline preserved | Context injection and explicit commands keep `task_plan.md` and `progress.md` in sync across multi-step workflows. |
| Multi-step workflow support | Init, status, and completion check tools compose naturally into longer agentic loops. |
| No stop/block parity | Completion enforcement is advisory. The platform will not halt the agent unconditionally at a lifecycle boundary. |
| Manual setup required | Project plugins must be enabled, the skill bundle must be registered, and the working directory must be correct. |
| Hook-based expectations may not transfer | Workflows designed around Claude Code's stop hook will need changes before they work correctly on Hermes. |

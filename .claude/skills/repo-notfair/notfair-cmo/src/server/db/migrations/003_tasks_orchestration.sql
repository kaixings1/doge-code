-- Tasks gain three columns to power the autonomous CMO orchestrator:
--
--   title              — short label distinct from the long brief, shown
--                        on /tasks cards + task detail header.
--   thread_id          — the OpenClaw chat session id this task's
--                        per-task thread runs under. The assignee picks
--                        up the task in this thread (TASK_BRIEF.md
--                        kickoff). Null until the user (or the CMO
--                        autonomously) opens the detail page; populated
--                        once and immutable.
--   assigner_agent_id  — who created this task. CMO assigns to specialists;
--                        in v1.1 specialists can create sub-tasks and
--                        this lets us walk the chain back to the planner.
ALTER TABLE tasks ADD COLUMN title TEXT;
ALTER TABLE tasks ADD COLUMN thread_id TEXT;
ALTER TABLE tasks ADD COLUMN assigner_agent_id TEXT;

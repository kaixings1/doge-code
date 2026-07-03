---
name: release
description: "Release — Release 相关功能和最佳实践"
level: 3
---

# Release Skill

A thin, repo-aware release assistant. On first run it inspects the project and CI to derive release rules, stores them in `.omc/RELEASE_RULE.md` for future use, then walks you through a release using those rules.

## Usage

```
/oh-my-claudecode:release [version]
```

- `version` is optional. If omitted the skill will ask. Accepts `patch`, `minor`, `major`, or an explicit semver like `2.4.0`.
- Add `--refresh` to force re-analysis of the repo even when a cached rule file exists.

## Execution Flow

### Step 0 — Load or Build Release Rules

Check whether `.omc/RELEASE_RULE.md` exists.

**If it does NOT exist (or `--refresh` was passed):** Run the full repo analysis below and write the file.

**If it DOES exist:** Read the file. Then do a quick delta check — scan `.github/workflows/` (or equivalent CI dirs: `.circleci/`, `.travis.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `gitlab-ci.yml`) for any modifications newer than the `last-analyzed` timestamp in the rule file. If relevant workflow files changed, re-run the analysis for those sections and update the file. Report what changed.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 29 MINUTES 23 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE
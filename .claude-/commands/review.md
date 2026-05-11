Review PR #$ARGUMENTS in the current project. Automatically:

1. **Read the full diff** — understand every change in the PR
2. **Read the linked work item** and verify all acceptance criteria are met
3. **Review for:**
   - Clean Architecture boundaries (Domain has no infrastructure dependencies)
   - Tenant/organizationId enforcement on all database queries
   - Missing unit or integration tests for new code
   - `any` types in TypeScript (should be properly typed)
   - Security issues (OWASP Top 10, hardcoded secrets, SQL/NoSQL injection)
   - Error handling (are exceptions caught appropriately?)
   - Naming conventions and code style consistency
   - Breaking changes or backwards compatibility issues
4. **Post inline comments** on all findings directly on the PR
5. **Post a PR-level summary comment** with:
   - Overall assessment (ready to merge / needs changes)
   - Count of issues by severity (critical / warning / suggestion)
   - Acceptance criteria checklist (met / not met / not applicable)
   - Test coverage assessment

Then ask me:
```
Review complete. Summary:
- X critical issues
- Y warnings
- Z suggestions
- Acceptance criteria: A/B met

Approve, Request Changes, or skip the vote?
```

Wait for my response before submitting any vote on the PR.

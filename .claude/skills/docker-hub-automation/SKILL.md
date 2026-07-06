---
name: docker-hub-自动化
description: "自动化 Docker Hub 操作——管理组织、仓库、团队、成员和 webhook。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具架构。"
requires:
  mcp:
    - rube
---

# Docker Hub /u81ea/u52a8/u5316

Automate your Docker Hub workflows -- create and manage organizations, repositories, teams, add members, set up image push webhooks, and list container images.

**/u5de5/u5177/u5305/u6587/u6863/uff1a** [composio.dev/toolkits/docker_hub](https://composio.dev/toolkits/docker_hub)

---

## /u8bbe/u7f6e

1. /u5c06 Composio MCP /u670d/u52a1/u5668/u6dfb/u52a0/u5230/u60a8/u7684/u5ba2/u6237/u7aef/uff1a `https://rube.app/mcp`
2. /u6309/u63d0/u793a/u8fde/u63a5/u60a8/u7684 Docker Hub /u8d26/u6237/uff08JWT//u4ee4/u724c/u8ba4/u8bc1/uff09
3. /u5f00/u59cb/u4f7f/u7528/u4ee5/u4e0b/u5de5/u4f5c/u6d41

---

## /u6838/u5fc3/u5de5/u4f5c/u6d41

### 1. List Organizations

Use `DOCKER_HUB_LIST_ORGANIZATIONS` to discover which organizations the authenticated user belongs to.

```
Tool: DOCKER_HUB_LIST_ORGANIZATIONS
Inputs:
  - page: integer (1-indexed, default 1)
  - page_size: integer (1-100, default 25)
```

### 2. Create an Organization

Use `DOCKER_HUB_CREATE_ORGANIZATION` to programmatically create a new Docker Hub organization.

```
Tool: DOCKER_HUB_CREATE_ORGANIZATION
Inputs:
  - orgname: string (required) -- lowercase, letters/numbers/._- only, min 2 chars
  - company: string (optional) -- company name associated with the org
```

**Note:** 需要 JWT 认证 obtained via `/v2/users/login` and may have restricted access.

### 3. Get Organization Details and Repositories

Use `DOCKER_HUB_GET_ORGANIZATION` to retrieve namespace info and its repositories. Works with any public namespace.

```
Tool: DOCKER_HUB_GET_ORGANIZATION
Inputs:
  - organization: string (required) -- e.g., "docker", "bitnami", "library"
```

### 4. Create a Repository

Use `DOCKER_HUB_CREATE_REPOSITORY` to create public or private repositories under a namespace.

```
Tool: DOCKER_HUB_CREATE_REPOSITORY
Inputs:
  - namespace: string (required) -- Docker Hub username or org name
  - name: string (required) -- lowercase; letters, numbers, ._- allowed
  - description: string (optional) -- max 100 characters
  - full_description: string (optional) -- Markdown README content
  - is_private: boolean (default false) -- private repos require paid plan
```

### 5. List Repositories with Filtering

Use `DOCKER_HUB_LIST_REPOSITORIES` to enumerate repos within a namespace with sorting and content-type filtering.

```
Tool: DOCKER_HUB_LIST_REPOSITORIES
Inputs:
  - namespace: string (required) -- e.g., "library", "myorg"
  - ordering: "name" | "last_updated" | "pull_count" (prefix with - for descending)
  - page: integer (default 1)
  - page_size: integer (1-100, default 25)
  - content_types: string (comma-separated, e.g., "image,artifact")
```

### 6. Manage Teams, Members, and Webhooks

Use `DOCKER_HUB_LIST_TEAMS` to list teams within an org, `DOCKER_HUB_ADD_ORG_MEMBER` to invite users, and `DOCKER_HUB_CREATE_WEBHOOK` for push notifications.

```
Tool: DOCKER_HUB_LIST_TEAMS
  - Lists all teams/groups within a Docker Hub organization

Tool: DOCKER_HUB_ADD_ORG_MEMBER
  - Invite a user to join an organization by Docker ID or email
  - Requires owner or admin permissions

Tool: DOCKER_HUB_CREATE_WEBHOOK
  - Create a webhook on a repository for image push notifications
  - Two-step process: create webhook, then add hook URL
  - Requires admin permissions on the repository
```

---

## /u5df2/u77e5/u9677/u9631

| /u9677/u9631 | /u8be6/u60c5 |
|---------|--------|
| JWT 认证 | `DOCKER_HUB_CREATE_ORGANIZATION` requires JWT auth from `/v2/users/login` -- standard API tokens may not suffice. |
| Private repo limits | Creating private repos (`is_private: true`) requires a paid Docker Hub plan. |
| Org name constraints | Organization names must be lowercase, at least 2 characters, containing only letters, numbers, `.`, `_`, or `-`. |
| Webhook two-step | `DOCKER_HUB_CREATE_WEBHOOK` is a two-step process: first create the webhook with a name, then add a hook URL to it. |
| Pagination | All list endpoints use page-based pagination -- iterate pages until results are exhausted. |

---

## /u5feb/u901f/u53c2/u8003

| /u5de5/u5177 标识符 | /u63cf/u8ff0 |
|-----------|-------------|
| `DOCKER_HUB_LIST_ORGANIZATIONS` | List orgs the user belongs to |
| `DOCKER_HUB_CREATE_ORGANIZATION` | Create a new Docker Hub organization |
| `DOCKER_HUB_GET_ORGANIZATION` | Get org details and repository list |
| `DOCKER_HUB_CREATE_REPOSITORY` | Create a repository under a namespace |
| `DOCKER_HUB_LIST_REPOSITORIES` | List repos with filtering and sorting |
| `DOCKER_HUB_LIST_TEAMS` | List teams/groups within an org |
| `DOCKER_HUB_ADD_ORG_MEMBER` | Invite a user to an organization |
| `DOCKER_HUB_CREATE_WEBHOOK` | Create push-notification webhook on a repo |

---

*/u7531 [Composio](https://composio.dev) /u63d0/u4f9b/u652f/u6301*

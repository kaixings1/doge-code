#!/usr/bin/env bash

set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/HELPMEEADICE/doge-code.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
GIT_USER_NAME="${GIT_USER_NAME:-github-actions[bot]}"
GIT_USER_EMAIL="${GIT_USER_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"

echo "Merging ${UPSTREAM_URL}@${UPSTREAM_BRANCH} into ${TARGET_BRANCH}"

git config user.name "${GIT_USER_NAME}"
git config user.email "${GIT_USER_EMAIL}"

if git remote get-url upstream >/dev/null 2>&1; then
  git remote set-url upstream "${UPSTREAM_URL}"
else
  git remote add upstream "${UPSTREAM_URL}"
fi

git fetch --prune origin "${TARGET_BRANCH}" || true
git fetch --prune upstream "${UPSTREAM_BRANCH}"

if git show-ref --verify --quiet "refs/remotes/origin/${TARGET_BRANCH}"; then
  git checkout -B "${TARGET_BRANCH}" "refs/remotes/origin/${TARGET_BRANCH}"
else
  git checkout -B "${TARGET_BRANCH}"
fi

if git merge-base --is-ancestor "refs/remotes/upstream/${UPSTREAM_BRANCH}" HEAD; then
  echo "${TARGET_BRANCH} already contains upstream/${UPSTREAM_BRANCH}"
  exit 0
fi

git merge --no-edit "refs/remotes/upstream/${UPSTREAM_BRANCH}"
git push origin "HEAD:refs/heads/${TARGET_BRANCH}"

echo "origin/${TARGET_BRANCH} now includes upstream/${UPSTREAM_BRANCH}"

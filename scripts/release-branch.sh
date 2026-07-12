#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ./scripts/release-branch.sh <branch> <tag> <tag-message>"
}

if [[ "$#" -ne 3 ]]; then
  usage >&2
  exit 2
fi

BRANCH_INPUT="$1"
TAG_NAME="$2"
TAG_MESSAGE="$3"
BRANCH="${BRANCH_INPUT#origin/}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before release." >&2
  exit 1
fi

git fetch origin
git checkout main
git pull --ff-only origin main

if ! git rev-parse --verify --quiet "origin/${BRANCH}^{commit}" >/dev/null; then
  echo "Remote branch origin/${BRANCH} does not exist." >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/${TAG_NAME}" >/dev/null; then
  echo "Local tag already exists: ${TAG_NAME}" >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/${TAG_NAME}" >/dev/null 2>&1; then
  echo "Remote tag already exists: ${TAG_NAME}" >&2
  exit 1
fi

git merge --ff-only "origin/${BRANCH}"
git push origin main
git tag -a "$TAG_NAME" -m "$TAG_MESSAGE"
git push origin "$TAG_NAME"

git status
git log --oneline --decorate -12
git stash list

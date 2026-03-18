---
name: feature-branch
description: Create a new feature branch in the current worktree following git worktree rules
argument-hint: <short description of the feature>
---

Create a new feature branch for: $ARGUMENTS

## Steps

1. Convert the description into a kebab-case branch name prefixed with `feature/` (e.g., "update grid" → `feature/update-grid`).
2. Verify you are inside a git worktree (`.claude/worktrees/`). If not, stop and tell the user this command is meant for worktree sessions.
3. Run `git -C <main-worktree-path> rev-parse --abbrev-ref HEAD` to confirm the main worktree is on `main`. If it is not, stop and alert the user.
4. Create the branch from latest main: `git checkout -b feature/<name> main`.
5. Confirm the new branch name and that it's ready for work.

## Rules

- Never `cd` to the main worktree.
- Never check out `main` in the worktree.
- The main worktree path is the repository root outside `.claude/worktrees/`.

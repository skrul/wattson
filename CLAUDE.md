# Project Guidelines

## Git Branching

- All new work must go on a feature branch — never commit directly to `main`.
- Always branch from the latest `main`: `git checkout -b feature/<name> main`.
- Merge feature branches back into `main` when complete.

## Git Worktree Rules

When working inside a git worktree (`.claude/worktrees/`), follow these rules strictly:

1. **Never `cd` to the main worktree.** Every git command must run from the worktree directory. The shell working directory must always be inside the worktree (e.g. `.claude/worktrees/<name>/`).
2. **Create branches in the worktree:** `git checkout -b <name> <base-ref>` — this creates a new branch from any ref and checks it out in the current worktree without touching the main worktree.
3. **Merge into main:** Use `git -C <main-worktree-path> merge <branch>` — this runs the merge in the main worktree without changing our shell directory.
5. **Never check out `main` in the worktree** — it's already checked out in the main worktree and git will refuse.
6. **Never switch branches in the main worktree** — it should always stay on `main`.

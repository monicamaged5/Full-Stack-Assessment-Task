# Bug Report: Unauthorized Task Status Modification

## Report

"Some users appear to be able to modify tasks belonging to projects they
are not members of."

## Root Cause

`TasksController.updateStatus` (`PATCH /tasks/:taskId/status`) did not
accept or forward the requesting user's ID to `TasksService.updateStatus`.
Without a user ID, the service had nothing to check authorization against,
so it skipped it entirely and mutated the task's status unconditionally.

Every other task-mutating method in the same file (`update`, `remove`,
`create`) receives the caller's ID and calls
`projectAccessService.assertCanView` or `assertCanManage` before making any
change. `updateStatus` was the one exception — a gap, not an intentional
design choice.

## Impact

Any authenticated user, regardless of organization or project membership,
could change the status of any task in the system, provided they knew (or
could enumerate/guess) its Mongo ID. This matches the report exactly: it
required no project relationship at all, only a valid login.

## Reproduction

Steps to reproduce (see `README.md` for how to run the app locally):

1. Register two users, A and B, in separate organizations with no shared
   project.
2. As user A, create a project and a task inside it; note the task's ID.
3. As user B, send `PATCH /tasks/:taskId/status` with a valid status value
   and B's own access token.
4. **Before the fix:** the request succeeds (200), despite B having no
   relationship to A's project.
   **After the fix:** the request is rejected (403 Forbidden).

These exact steps are now encoded as an automated test — see Regression
Prevention below.

## Fix

- `TasksController.updateStatus` now accepts `@CurrentUser('id') userId`
  and passes it through, matching every other task-mutating endpoint.
- `TasksService.updateStatus` now accepts `userId` and calls
  `projectAccessService.assertCanView(task.projectId, userId)` before
  mutating `task.status`, exactly the same pattern `update()` already uses.

No stricter check (e.g. `assertCanManage` or "must be the creator") was
added on top, since the original report only concerns cross-project access,
not which in-project role may change status — any project member changing
a task's status is expected, ordinary behavior for a Kanban-style board.

## Regression Prevention

`apps/api/test/task-status-authorization.e2e.spec.ts` covers this
directly: it asserts a user with no membership in a task's project
receives `403` on `PATCH /tasks/:taskId/status` and that the task's status
is left unchanged, asserts an unauthenticated request receives `401`, and
asserts a user who *does* have project access can still update status
normally (so the fix doesn't overcorrect into blocking legitimate use).

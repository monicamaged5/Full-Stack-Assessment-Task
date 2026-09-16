# AI Usage Log

## Tools Used

Claude (Anthropic), used conversationally throughout the assessment.

## How I Used It

- **Exploration**: reading through the unfamiliar codebase — module
  structure, the `ProjectAccessService` authorization model, existing
  patterns in `comments/` and `tasks/` before writing anything new.
- **Planning**: deciding where new logic should live (e.g. a dedicated
  `PATCH /tasks/:taskId/assignee` endpoint vs. folding it into the generic
  update endpoint; how to avoid a circular module dependency between
  `TasksModule` and a new activity module).
- **Debugging**: catching signature mismatches between controller and
  service methods, and a null-check ordering bug (dereferencing a possibly-
  null value before the guard that checked for it).
- **Concurrency discussion**: talking through why `countDocuments()+1` is a
  race condition and why MongoDB's atomic `$inc` fixes it.
- I wrote the actual code changes myself, using Claude's explanations and
  targeted corrections rather than pasted-in implementations.

## Suggestions I Rejected / Changed

- Claude's first version of the concurrency-fix null guard used
  `ForbiddenException` for a "project not found" case; I initially left it
  as-is but was told (and agreed) this should be `NotFoundException` (404,
  not a permissions issue) — corrected to match the existing pattern in
  `findTaskOrFail`.
- Initially restricted *all* unassignment to users who can manage the
  project, reasoning that the brief only explicitly guarantees
  self-assignment for regular members, not self-removal. Reversed this
  after writing the test suite: a regular member being able to assign
  themselves but never able to undo it is an inconsistent, worse
  experience than the stricter reading protects against, and "an
  authorized user may remove the current assignee" is naturally symmetric
  with "a regular member may assign a task to themselves." Changed
  `TasksService.assign` so a member can also remove an assignment that is
  currently their own — anyone removing someone else's assignment still
  requires `canManage`.

## Generated Code I Modified

- An early draft of the `assign()` permission check mixed up which method
  it belonged in — I had put manager-only logic inside `updateStatus`
  instead of a separate `assign` method, and had to pull it out into its
  own method with its own signature.
- The `assigneeIds`/batched-user-lookup logic in `toSummaries` went through
  several corrections: an initial attempt tried to build a `Map` directly
  with `.filter()` (wrong method for that job), and a follow-up computed
  the ID list *after* the query that needed it, so it wasn't taking effect
  yet. Both were corrected before the code was finalized.

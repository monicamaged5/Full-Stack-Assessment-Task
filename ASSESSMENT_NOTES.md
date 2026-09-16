# Assessment Notes

## Architecture

### Structure & major modules

The backend (`apps/api`) is a NestJS app organized into one module per domain
concern: `auth`, `users`, `organizations`, `organization-members`, `projects`,
`project-members`, `tasks`, `comments`. Each module follows the same internal
shape — `*.controller.ts` (HTTP routes), `*.service.ts` (business logic),
`schemas/*.schema.ts` (Mongoose document shape), and `dto/*.dto.ts`
(request validation). This keeps each concern self-contained: to understand
how tasks work, you only need to read the `tasks/` folder plus the one shared
service it depends on (`ProjectAccessService`).

The frontend (`apps/web`) is a Next.js App Router app. Routes under `src/app`
are thin — they just resolve params and render a feature component. All real
UI logic lives under `src/features/<domain>/`, each with its own `api.ts`
(typed fetch calls), `hooks.ts` (TanStack Query wrappers), and `components/`.

A shared package (`packages/shared`) holds enums (`TaskStatus`, `ProjectRole`,
etc.) and API response types (`TaskDetail`, `ProjectSummary`, ...) imported by
both apps, so the contract between frontend and backend is a single source of
truth instead of being duplicated.

### Where business logic lives

Controllers are intentionally thin — they parse/validate the request and
forward to a service method. All actual rules ("can this user edit this
task," "must the project key be unique," "is this the task's creator") live
in the services. Schemas only describe data shape and low-level constraints
(required fields, max length, enum membership); they carry no awareness of
users, roles, or permissions.

### Frontend ↔ backend communication & server state

The frontend never touches the database directly. Every piece of server data
flows through one path: a component calls a hook in `features/<domain>/hooks.ts`,
which calls a typed function in `features/<domain>/api.ts`, which calls
`apiRequest()` in `lib/api-client.ts`. `apiRequest` is the single choke point:
it builds the URL against `NEXT_PUBLIC_API_URL`, attaches the JWT bearer token
from `auth-storage.ts`, and normalizes error responses into a consistent
`ApiError`.

Server state (anything owned by the database — projects, tasks, comments) is
managed entirely by TanStack Query, with query keys centralized in
`lib/query-keys.ts` so cache invalidation after a mutation is predictable
(e.g. creating a task invalidates that project's task list). Local-only UI
state (e.g. a dialog being open) stays in plain React state. Server
components in this app (`page.tsx` files) do not fetch data themselves —
they only resolve route params and delegate to `'use client'` components,
so all data fetching is client-side via React Query.

### Authentication & authorization

Authentication is JWT-based: `JwtAuthGuard` is registered globally
(`app.module.ts`) and runs on every route unless the handler is marked
`@Public()`. It verifies the bearer token and attaches `{ id, email }` to the
request as `request.user`, retrievable in controllers via the `@CurrentUser()`
decorator.

Authorization is a distinct, explicit step performed by services, not the
guard. `ProjectAccessService` is the single place that answers "may this user
touch this project?":
- `assertCanView` — true if the user has an elevated organization role
  (`OWNER`/`ADMIN`, which grants access to every project in the org) OR an
  explicit row in `project_members` for this project.
- `assertCanManage` — true if elevated org role OR the user's project role is
  `PROJECT_MANAGER`.

Every task/comment mutation is expected to call one of these before acting.
This matters because it means authorization is opt-in per service method
rather than enforced structurally — a method that forgets to call it is a
silent hole (see Observations, and the production bug investigation).

### Entity relationships

```
User ── OrganizationMember ── Organization   (role: OWNER | ADMIN | MEMBER)
Organization ── Project
Project ── ProjectMember ── User             (role: PROJECT_MANAGER | MEMBER)
Project ── Task ── Comment
```

Membership is stored as its own collection with a unique compound index on
`(projectId, userId)` (or `(organizationId, userId)`) rather than as an array
on the parent document, so "what's this user's role here?" is a single
indexed lookup instead of a document scan.

## Observations

### 1. `updateStatus` performs no authorization check

**What I noticed:** `TasksController.updateStatus` / `TasksService.updateStatus`
(`PATCH /tasks/:taskId/status`) never receives or checks the requesting
user's ID. Every other task-mutating method (`update`, `remove`, `create`)
calls `projectAccessService.assertCanView`/`assertCanManage` first;
`updateStatus` skips this entirely.

**Why it's a problem:** Any authenticated user — regardless of organization
or project membership — can change the status of any task in the system,
as long as they know its Mongo ID. This matches the exact production report
("some users appear to be able to modify tasks belonging to projects they
are not members of").

**Fix now or later:** Now — this is a live authorization hole with no
mitigating factor. Covered in `BUG_REPORT.md` with a fix and regression test.

### 2. Task numbering is a count-then-increment race condition

**What I noticed:** `TasksService.create` computes the next task number as
`(await this.taskModel.countDocuments({ projectId })) + 1`. Two concurrent
create requests for the same project can both read the same count before
either writes, producing two tasks with the same `number`/`key`
(e.g. two tasks named `ENG-4`).

**Why it's a problem:** Task keys are meant to be unique, human-readable
identifiers people reference in conversation and links. A collision breaks
that guarantee silently — no error, just two tasks with the same name.

**Fix now or later:** Now — it's explicitly in scope (Part 12) and is a
straightforward atomic-counter fix.

### 3. Task deletion isn't atomic across collections

**What I noticed:** `TasksService.remove` deletes the task's comments and
the task itself via `Promise.all([commentModel.deleteMany(...), task.deleteOne()])`.
`Promise.all` runs both operations concurrently but does not make them
succeed or fail as a single unit.

**Why it's a problem:** If one operation succeeds and the other fails (e.g.
a dropped connection between the two calls), the result is orphaned data —
comments referencing a deleted task, or a task whose comments were never
cleaned up.

**Fix now or later:** Later. It only manifests on partial infrastructure
failure, is low-frequency, and a proper fix (a MongoDB session/transaction,
which requires a replica-set connection) is a bigger change than this
assessment's scope justifies. Noted here as a known limitation instead.

## Design Decisions — Task Assignment

### Data model

`Task` gained a nullable `assigneeId` (`Types.ObjectId | null`, default
`null`), kept separate from `createdBy` per the brief. Membership for
assignment purposes is checked via the existing `ProjectMembersService`
rather than inventing a new notion of "belongs to this project."

### Business rules — how ambiguity was resolved

The brief's three rules are precise, but two things are left implicit, and
I made explicit calls on both rather than guessing silently:

- **Who may unassign.** Rule #3 says "an authorized user" without defining
  it for this direction. I made it symmetric with assignment: `OWNER`,
  `ADMIN`, and `PROJECT_MANAGER` can clear anyone's assignment; a regular
  member can only clear an assignment that is currently their own — the
  same self-service carve-out Rule #2 gives for assigning. A member who is
  not the current assignee gets `403` trying to unassign someone else.
  Implemented as a single `isSelfTarget` check in `TasksService.assign`
  that covers both the "assign to self" and "unassign from self" cases the
  same way.
- **Order of checks.** Membership validity of the *target* (is the person
  being assigned actually a project member?) is checked before the
  *actor's* permission to make that assignment. In practice this only
  matters for the error code returned when both are wrong at once; I judged
  "does this assignment even make sense" as the more fundamental question.

### Task numbering (concurrency)

`Project` gained a `taskCounter: number` field (default `0`). Task creation
issues the next number via a single atomic `findByIdAndUpdate(projectId,
{ $inc: { taskCounter: 1 } }, { new: true })` rather than
`countDocuments() + 1`. `$inc` inside `findByIdAndUpdate` is one atomic
document operation in MongoDB — there is no read-then-write gap for two
concurrent requests to land on the same number the way there was with
`countDocuments`. Verified with an automated test that fires many
concurrent creation requests against the same project and asserts the
resulting numbers are unique with no gaps.

I considered a separate `counters` collection (one document per project,
decoupled from the `Project` document) instead of a field directly on
`Project`. I went with the field because it avoids an extra collection and
an extra round-trip, and `Project` is already the natural owner of "how
many tasks has this project had" — the trade-off is that every task
creation now also writes to the `Project` document, which is a negligible
cost at this scale but would be worth revisiting if `Project` writes ever
become a contention point independent of task creation.

## Code Review

```ts
async assignTask(taskId: string, assigneeId: string, userId: string) {
  const task = await this.taskModel.findById(taskId);
  if (!task) { throw new NotFoundException(); }
  const user = await this.userModel.findById(assigneeId);
  if (!user) { throw new NotFoundException(); }
  task.assignee = user._id;
  await task.save();
  return task;
}
```

What I'd ask the author to change, and why:

1. **No authorization check at all.** This is the exact same class of bug
   as the production issue in `BUG_REPORT.md`: any authenticated caller —
   not a project member, not even in the same organization — can assign
   any task to any user by guessing two ids. `userId` is accepted as a
   parameter but never used. This needs
   `projectAccessService.assertCanView`/`assertCanManage` before anything
   is read or mutated.
2. **No business-rule enforcement.** None of the three rules from the
   brief are implemented here: whether the assignee is actually a member
   of the task's project is never checked, and there's no distinction
   between a manager assigning someone else versus a regular member
   assigning themselves. As written, any user can be assigned to any task
   in any project.
3. **No activity record.** The assignee changes silently with no audit
   trail, which the brief explicitly requires.
4. **Raw Mongoose document returned.** `return task` sends the full
   Mongoose document — internal fields, no `UserSummary` projection for
   `assignee`/`createdBy` — straight back, inconsistent with every other
   service in this codebase, which returns a typed `TaskDetail`/`TaskSummary`
   built via `toDetail`/`toSummaries`.
5. **No "did this actually change?" check.** Re-assigning to the current
   assignee still writes to the database, and would create a spurious
   activity record for a no-op if the audit-trail gap above were fixed
   naively without this guard.
6. **The two `findById` calls are sequential** despite being independent
   reads (loading the task, loading the candidate user) — minor on its
   own, but worth flagging since fixing the missing authorization check
   above means this function does more I/O than a straightforward
   `Promise.all` would need.
7. **`assigneeId` isn't validated as a Mongo id before use.** An invalid
   id reaches `findById` directly; every other DTO/handler in this
   codebase goes through `@IsMongoId()` specifically to turn that into a
   clean `400` instead of a driver-level cast error.

I did not rewrite the function inline — `TasksService.assign` in this
repository is effectively the answer to "what should this look like,"
built the way the rest of the codebase already is (`ProjectAccessService`
for authorization, a typed `TaskDetail` response, an activity write only
when the value actually changes).

## Scaling the Activity System (5,000 → 500,000 users)

**Today's design is right for today's scale.** A single `task_activities`
collection, synchronous writes on assignment, offset pagination matching
the rest of the API. None of that is wrong at 5,000 users — the question
is what breaks first as the system grows, roughly in the order I'd expect
to hit it:

1. **Indexes.** `{ taskId: 1, createdAt: -1 }` already serves "activity
   for one task, newest first" without a collection scan or in-memory
   sort. That stays true at 500k users, since the query is scoped to one
   task's activity, which doesn't grow with total user count — what grows
   is total document count in the collection, affecting index size and
   cache-hit rate, not query correctness.
2. **Offset pagination becomes a real cost** once a single long-lived,
   frequently-reassigned task accumulates thousands of activity rows —
   `skip(N)` still walks N documents server-side. I'd switch to
   cursor-based pagination (`createdAt` + `_id` as a compound cursor)
   before this becomes user-visible, as a backwards-compatible addition
   alongside the existing `page`/`pageSize` params rather than a breaking
   change.
3. **Query patterns beyond a single task.** Nothing today asks "all
   activity across this project" — if that becomes a product need (an
   activity feed on the project page), it needs its own index
   (`{ projectId: 1, createdAt: -1 }`, meaning `projectId` gets stored
   redundantly on `TaskActivity` to avoid a per-row lookup) and probably a
   separate, purpose-built read path rather than generalizing the
   per-task endpoint.
4. **Data growth and retention.** Activity is append-only and never
   updated — a natural fit for time-based archiving once a task's history
   is old enough nobody is realistically paging through it (a threshold to
   set with product, not engineering). I'd move it out of the hot
   collection via a scheduled job, not delete it outright without an
   explicit retention decision.
5. **Asynchronous processing.** The activity write itself is one small
   insert and can stay synchronous with the assignment request for a long
   time — it's not worth a queue on its own. Where a queue earns its keep
   is anything activity *triggers* that isn't required for the HTTP
   response to be correct: notification delivery ("you were assigned"),
   search-index updates. I'd introduce a queue (nothing like Redis/RabbitMQ
   exists in this stack today) at the point those features are actually
   built, not preemptively.
6. **Real-time updates.** Right now the frontend learns about new activity
   by invalidating and refetching after a mutation. At scale, with several
   people on the same busy task, that's stale between refetches. I'd reach
   for Server-Sent Events on a per-task channel before adopting a heavier
   pub/sub layer — enough for "someone changed the assignee, refresh,"
   without the operational cost of Kafka or a dedicated WebSocket service.
7. **Caching.** `ProjectMembersService`/authorization lookups (two queries
   per task-touching request) are the first thing I'd cache, not activity
   itself — that's a correctness-sensitive cache (short TTL, explicit
   invalidation on membership writes) versus activity data, which is
   already served efficiently by its index and lower-value to cache.

**What I would not reach for:** Kafka, event sourcing, CQRS, or
microservices. "Record what happened when the assignee changes, and let
people page through it" doesn't need an event-sourced model — the current
row-per-change table already *is* the event log. Splitting activity into
its own service only makes sense once it needs to scale, deploy, or fail
independently of the rest of the API, and nothing here suggests that at
500k users on a single well-indexed MongoDB collection.

## If I Had Two More Days

In priority order:

1. **Run the full test suite against a real MongoDB and confirm every
   scenario actually passes**, not just typechecks. I validated the logic
   by hand against every test case while building this, and both `pnpm
   typecheck` and `pnpm lint` are clean across the whole workspace, but I
   have not personally watched a green `pnpm test` run — that's the single
   highest-priority item precisely because it's the one thing left
   unverified end-to-end.
2. **Let `OWNER`/`ADMIN` show up as assignable candidates in the UI even
   without an explicit `ProjectMember` row**, if the backend is extended
   to treat them as valid targets the way `ProjectAccessService` treats
   them everywhere else. Right now assignment strictly requires a
   `ProjectMembersService.findRole` hit, which is the more literal (and
   simpler) reading of "member of the project" — worth a product
   conversation on whether an org owner who never explicitly joined a
   project should be assignable to its tasks.
3. **Cursor-based pagination for task activity**, ahead of it being a
   measured problem (see Scaling §2), since it's a backwards-compatible
   addition and better to ship deliberately than retrofit under pressure.
4. **Rate limiting on `/auth/login` and `/auth/register`** — no rate
   limiting exists anywhere in the API today; not something this
   assessment's scope required touching, but a real gap worth flagging.
5. **Notifications on assignment** ("you were assigned to ENG-12") — the
   most obviously-missing feature once assignment exists as a concept; I'd
   want to design the async delivery path properly (see Scaling §5) rather
   than bolt it on synchronously under time pressure.

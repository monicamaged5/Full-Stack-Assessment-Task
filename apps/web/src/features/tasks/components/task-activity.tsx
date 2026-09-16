'use client';

import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr';
import type { TaskActivityEntry } from '@projectflow/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/format';
import { useTaskActivity } from '../hooks';

/**
 * Renders activity as plain history sentences ("Ammar assigned Magd") in
 * line with the brief -- not raw `{ type, metadata }` records.
 */
function describeActivity(entry: TaskActivityEntry): string {
  const { actor, metadata } = entry;
  const { from, to } = metadata;

  if (from && to) {
    const fromLabel = from.id === actor.id ? 'themselves' : from.name;
    const toLabel = to.id === actor.id ? 'themselves' : to.name;
    return `${actor.name} changed the assignee from ${fromLabel} to ${toLabel}`;
  }
  if (to) {
    const toLabel = to.id === actor.id ? 'themselves' : to.name;
    return `${actor.name} assigned ${toLabel}`;
  }
  if (from) {
    return `${actor.name} removed the assignee`;
  }
  return `${actor.name} updated the assignee`;
}

export function TaskActivityTimeline({ taskId }: { taskId: string }) {
  const { data, isPending, isError, error } = useTaskActivity(taskId);

  return (
    <section className="space-y-4" aria-label="Activity">
      <h2 className="text-sm font-semibold text-foreground">Activity</h2>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : isError ? (
        <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          {error.message}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwiseIcon}
          title="No activity yet"
          description="Assignee changes will show up here."
        />
      ) : (
        <ul className="space-y-2.5">
          {data.items.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 text-muted-foreground">{describeActivity(entry)}</span>
              <span className="shrink-0 text-[12px] text-subtle-foreground">
                {formatRelativeTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

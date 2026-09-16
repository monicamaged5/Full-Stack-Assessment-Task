'use client';

import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { isElevatedOrganizationRole, ProjectRole, type ProjectMemberEntry } from '@projectflow/shared';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/features/auth/hooks';
import { useProject, useProjectMembers } from '@/features/projects/hooks';
import { useAssignTask } from '../hooks';

interface AssigneeSelectorProps {
  taskId: string;
  projectId: string;
  assignee: { id: string; name: string; avatarUrl?: string | null } | null;
}

const UNASSIGNED_VALUE = '__unassigned__';

export function AssigneeSelector({ taskId, projectId, assignee }: AssigneeSelectorProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: project, isPending: isProjectPending } = useProject(projectId);
  const { data: members, isPending: isMembersPending } = useProjectMembers(projectId);
  const assignTask = useAssignTask(taskId, projectId);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    searchInputRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isPending = isProjectPending || isMembersPending || !currentUser;

  const canManage = useMemo(() => {
    if (!currentUser || !project) {
      return false;
    }
    const organizationRole = currentUser.organizations.find(
      (organization) => organization.id === project.organizationId,
    )?.role;
    if (isElevatedOrganizationRole(organizationRole)) {
      return true;
    }
    const myMembership = members?.find((member) => member.user.id === currentUser.id);
    return myMembership?.role === ProjectRole.PROJECT_MANAGER;
  }, [currentUser, project, members]);

  // A regular member may only target themselves -- assign the task to
  // themselves or clear their own assignment -- so their selectable list is
  // just themselves, not the whole project. Matches the backend rule in
  // TasksService.assign exactly.
  const selectableMembers: ProjectMemberEntry[] = useMemo(() => {
    if (!members || !currentUser) {
      return [];
    }
    return canManage ? members : members.filter((member) => member.user.id === currentUser.id);
  }, [members, currentUser, canManage]);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return selectableMembers;
    }
    return selectableMembers.filter(
      (member) =>
        member.user.name.toLowerCase().includes(normalizedQuery) ||
        member.user.email.toLowerCase().includes(normalizedQuery),
    );
  }, [selectableMembers, query]);

  const canUnassign = canManage || assignee?.id === currentUser?.id;

  function handleSelect(value: string) {
    setIsOpen(false);
    setQuery('');

    if (value === assignee?.id || (value === UNASSIGNED_VALUE && !assignee)) {
      return;
    }

    if (value === UNASSIGNED_VALUE) {
      assignTask.mutate(
        { assigneeId: null, optimisticAssignee: null },
        { onError: (error) => toast.error(error.message) },
      );
      return;
    }

    const member = members?.find((entry) => entry.user.id === value);
    if (!member) {
      return;
    }
    assignTask.mutate(
      { assigneeId: member.user.id, optimisticAssignee: member.user },
      { onError: (error) => toast.error(error.message) },
    );
  }

  if (isPending) {
    return <Skeleton className="h-8 w-full" />;
  }

  const isDisabled = assignTask.isPending || (selectableMembers.length === 0 && !canUnassign);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Assignee"
        disabled={isDisabled}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground',
          'hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {assignee ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar user={assignee} size="sm" />
            <span className="truncate">{assignee.name}</span>
          </span>
        ) : (
          <span className="text-subtle-foreground">Unassigned</span>
        )}
        <CaretDownIcon size={12} weight="bold" className="shrink-0 text-subtle-foreground" />
      </button>

      {isOpen ? (
        <div
          role="listbox"
          aria-label="Assign to project member"
          className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-56 overflow-hidden rounded-md border border-border bg-background shadow-md"
        >
          {selectableMembers.length > 1 ? (
            <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
              <MagnifyingGlassIcon size={13} className="shrink-0 text-subtle-foreground" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members..."
                className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle-foreground"
              />
            </div>
          ) : null}

          <div className="max-h-64 overflow-y-auto p-1">
            {canUnassign ? (
              <button
                type="button"
                role="option"
                aria-selected={!assignee}
                onClick={() => handleSelect(UNASSIGNED_VALUE)}
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-muted-foreground outline-none hover:bg-surface-strong"
              >
                <span className="flex items-center gap-2">
                  <XIcon size={13} />
                  Unassigned
                </span>
                {!assignee ? <CheckIcon size={13} weight="bold" className="text-primary" /> : null}
              </button>
            ) : null}

            {filteredMembers.length === 0 ? (
              <p className="px-2 py-3 text-center text-[12px] text-subtle-foreground">
                No matching members
              </p>
            ) : (
              filteredMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  role="option"
                  aria-selected={member.user.id === assignee?.id}
                  onClick={() => handleSelect(member.user.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-foreground outline-none hover:bg-surface-strong"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar user={member.user} size="sm" />
                    <span className="truncate">{member.user.name}</span>
                  </span>
                  {member.user.id === assignee?.id ? (
                    <CheckIcon size={13} weight="bold" className="shrink-0 text-primary" />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Paginated,
  TaskActivityEntry,
  TaskDetail,
  TaskStatus,
  TaskSummary,
  UserSummary,
} from '@projectflow/shared';
import { queryKeys } from '@/lib/query-keys';
import {
  assignTask,
  createTask,
  type CreateTaskPayload,
  fetchProjectTasks,
  fetchTask,
  fetchTaskActivity,
  updateTaskStatus,
} from './api';

export function useProjectTasks(projectId: string) {
  return useQuery<Paginated<TaskSummary>>({
    queryKey: queryKeys.projectTasks(projectId),
    queryFn: () => fetchProjectTasks(projectId),
    enabled: projectId.length > 0,
  });
}

export function useTask(taskId: string) {
  return useQuery<TaskDetail>({
    queryKey: queryKeys.task(taskId),
    queryFn: () => fetchTask(taskId),
    enabled: taskId.length > 0,
  });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, CreateTaskPayload>({
    mutationFn: (payload) => createTask(projectId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
    },
  });
}

export function useUpdateTaskStatus(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, TaskStatus>({
    mutationFn: (status) => updateTaskStatus(taskId, status),
    onSuccess: async (task) => {
      queryClient.setQueryData(queryKeys.task(taskId), task);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useTaskActivity(taskId: string) {
  return useQuery<Paginated<TaskActivityEntry>>({
    queryKey: queryKeys.taskActivity(taskId),
    queryFn: () => fetchTaskActivity(taskId),
    enabled: taskId.length > 0,
  });
}

export interface AssignTaskInput {
  assigneeId: string | null;
  /**
   * The member to show immediately, before the server confirms the change.
   * The caller (the assignee selector) already has this from the project
   * members list, so the optimistic UI can show the right name/avatar
   * instead of just clearing the field until the request resolves.
   */
  optimisticAssignee: UserSummary | null;
}

interface AssignTaskContext {
  previousTask?: TaskDetail;
}

/** Optimistic assignee update with rollback on error. */
export function useAssignTask(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, AssignTaskInput, AssignTaskContext>({
    mutationFn: ({ assigneeId }) => assignTask(taskId, assigneeId),
    onMutate: async ({ optimisticAssignee }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previousTask = queryClient.getQueryData<TaskDetail>(queryKeys.task(taskId));

      if (previousTask) {
        queryClient.setQueryData<TaskDetail>(queryKeys.task(taskId), {
          ...previousTask,
          assignee: optimisticAssignee,
        });
      }

      return { previousTask };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(queryKeys.task(taskId), context.previousTask);
      }
    },
    onSuccess: (task) => {
      queryClient.setQueryData(queryKeys.task(taskId), task);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.taskActivity(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) }),
      ]);
    },
  });
}

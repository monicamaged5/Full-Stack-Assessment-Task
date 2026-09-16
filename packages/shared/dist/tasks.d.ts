export declare enum TaskStatus {
    TODO = "TODO",
    IN_PROGRESS = "IN_PROGRESS",
    IN_REVIEW = "IN_REVIEW",
    DONE = "DONE"
}
export declare enum TaskActivityType {
    TASK_ASSIGNEE_CHANGED = "TASK_ASSIGNEE_CHANGED"
}
export declare enum TaskPriority {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    URGENT = "URGENT"
}
export declare const TASK_ACTIVITY_TYPES: TaskActivityType.TASK_ASSIGNEE_CHANGED[];
export declare const TASK_STATUSES: TaskStatus[];
export declare const TASK_PRIORITIES: TaskPriority[];
/** Left-to-right order used by the board and by grouped task lists. */
export declare const TASK_STATUS_ORDER: readonly TaskStatus[];
export declare const TASK_STATUS_LABELS: Record<TaskStatus, string>;
export declare const TASK_PRIORITY_LABELS: Record<TaskPriority, string>;
//# sourceMappingURL=tasks.d.ts.map
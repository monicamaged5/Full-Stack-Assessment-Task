"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASK_PRIORITY_LABELS = exports.TASK_STATUS_LABELS = exports.TASK_STATUS_ORDER = exports.TASK_PRIORITIES = exports.TASK_STATUSES = exports.TASK_ACTIVITY_TYPES = exports.TaskPriority = exports.TaskActivityType = exports.TaskStatus = void 0;
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["TODO"] = "TODO";
    TaskStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TaskStatus["IN_REVIEW"] = "IN_REVIEW";
    TaskStatus["DONE"] = "DONE";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var TaskActivityType;
(function (TaskActivityType) {
    TaskActivityType["TASK_ASSIGNEE_CHANGED"] = "TASK_ASSIGNEE_CHANGED";
})(TaskActivityType || (exports.TaskActivityType = TaskActivityType = {}));
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["LOW"] = "LOW";
    TaskPriority["MEDIUM"] = "MEDIUM";
    TaskPriority["HIGH"] = "HIGH";
    TaskPriority["URGENT"] = "URGENT";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
exports.TASK_ACTIVITY_TYPES = Object.values(TaskActivityType);
exports.TASK_STATUSES = Object.values(TaskStatus);
exports.TASK_PRIORITIES = Object.values(TaskPriority);
/** Left-to-right order used by the board and by grouped task lists. */
exports.TASK_STATUS_ORDER = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.IN_REVIEW,
    TaskStatus.DONE,
];
exports.TASK_STATUS_LABELS = {
    [TaskStatus.TODO]: 'To do',
    [TaskStatus.IN_PROGRESS]: 'In progress',
    [TaskStatus.IN_REVIEW]: 'In review',
    [TaskStatus.DONE]: 'Done',
};
exports.TASK_PRIORITY_LABELS = {
    [TaskPriority.LOW]: 'Low',
    [TaskPriority.MEDIUM]: 'Medium',
    [TaskPriority.HIGH]: 'High',
    [TaskPriority.URGENT]: 'Urgent',
};
//# sourceMappingURL=tasks.js.map
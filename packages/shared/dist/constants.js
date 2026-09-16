"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.COMMENT_MAX_LENGTH = exports.TASK_DESCRIPTION_MAX_LENGTH = exports.TASK_TITLE_MAX_LENGTH = exports.PASSWORD_MAX_LENGTH = exports.PASSWORD_MIN_LENGTH = exports.ORGANIZATION_SLUG_PATTERN = exports.PROJECT_KEY_PATTERN = void 0;
exports.PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
exports.ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
exports.PASSWORD_MIN_LENGTH = 8;
exports.PASSWORD_MAX_LENGTH = 72;
exports.TASK_TITLE_MAX_LENGTH = 200;
exports.TASK_DESCRIPTION_MAX_LENGTH = 5000;
exports.COMMENT_MAX_LENGTH = 2000;
exports.DEFAULT_PAGE_SIZE = 25;
exports.MAX_PAGE_SIZE = 100;
//# sourceMappingURL=constants.js.map
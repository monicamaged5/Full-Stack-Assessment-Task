"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ELEVATED_ORGANIZATION_ROLES = exports.PROJECT_ROLES = exports.ORGANIZATION_ROLES = exports.ProjectRole = exports.OrganizationRole = void 0;
exports.isElevatedOrganizationRole = isElevatedOrganizationRole;
/** Role a user holds inside an organization. */
var OrganizationRole;
(function (OrganizationRole) {
    OrganizationRole["OWNER"] = "OWNER";
    OrganizationRole["ADMIN"] = "ADMIN";
    OrganizationRole["MEMBER"] = "MEMBER";
})(OrganizationRole || (exports.OrganizationRole = OrganizationRole = {}));
/** Role a user holds inside a single project. */
var ProjectRole;
(function (ProjectRole) {
    ProjectRole["PROJECT_MANAGER"] = "PROJECT_MANAGER";
    ProjectRole["MEMBER"] = "MEMBER";
})(ProjectRole || (exports.ProjectRole = ProjectRole = {}));
exports.ORGANIZATION_ROLES = Object.values(OrganizationRole);
exports.PROJECT_ROLES = Object.values(ProjectRole);
/** Organization roles that grant access to every project in the organization. */
exports.ELEVATED_ORGANIZATION_ROLES = [
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
];
function isElevatedOrganizationRole(role) {
    return role != null && exports.ELEVATED_ORGANIZATION_ROLES.includes(role);
}
//# sourceMappingURL=roles.js.map
/** Role a user holds inside an organization. */
export declare enum OrganizationRole {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MEMBER = "MEMBER"
}
/** Role a user holds inside a single project. */
export declare enum ProjectRole {
    PROJECT_MANAGER = "PROJECT_MANAGER",
    MEMBER = "MEMBER"
}
export declare const ORGANIZATION_ROLES: OrganizationRole[];
export declare const PROJECT_ROLES: ProjectRole[];
/** Organization roles that grant access to every project in the organization. */
export declare const ELEVATED_ORGANIZATION_ROLES: readonly OrganizationRole[];
export declare function isElevatedOrganizationRole(role: OrganizationRole | null | undefined): boolean;
//# sourceMappingURL=roles.d.ts.map
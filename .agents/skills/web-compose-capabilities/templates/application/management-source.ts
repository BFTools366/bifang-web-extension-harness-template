import type { ApplicationPage } from "./contracts.ts"

/** 标准组织管理读取页只随明确操作装配。 */
export function managementPages(workspace: boolean): ApplicationPage[] {
  return [
    {
      path: "/organization/settings",
      file: "organization_.settings",
      component: "OrganizationSettingsPage",
      title: "organizationSettings",
      module: "organization"
    },
    ...(workspace
      ? [
          {
            path: "/organization/members",
            file: "organization_.members",
            component: "OrganizationMembersPage",
            title: "orgMembersTitle",
            module: "organization"
          },
          {
            path: "/organization/roles",
            file: "organization_.roles",
            component: "OrganizationRolesPage",
            title: "orgRolesTitle",
            module: "organization"
          }
        ]
      : [])
  ]
}
/** 前后端共享的动作要求；每个写入都同时要求所属读取权限。 */
export function managementActions(workspace: boolean): Record<string, string[]> {
  const groups: Record<string, string[]> = workspace
    ? {
        settings: ["update"],
        members: ["invite", "remove", "nickname.update", "roles.assign"],
        roles: ["create", "delete", "permissions.update"]
      }
    : { settings: ["update"] }
  return Object.fromEntries(
    Object.entries(groups).flatMap(([group, actions]) =>
      actions.map((action) => [
        `team.${group}.${action}`,
        [`team.${group}.read`, `team.${group}.${action}`]
      ])
    )
  )
}
/** 页面只消费精确读取码，角色名称不能作为前端放行依据。 */
export function managementPagePermissions(workspace: boolean): Record<string, string[]> {
  return Object.fromEntries(
    managementPages(workspace).map((page) => [
      page.path,
      [`team.${page.path.split("/").at(-1)}.read`]
    ])
  )
}

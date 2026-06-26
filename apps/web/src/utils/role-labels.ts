import { ROLE_REGISTRY } from "../../../../packages/agent-core/src/roles/role-registry.js";
import type { DepartmentId, RoleId } from "../../../../packages/shared/src/index.js";

export function getRoleDefinition(roleId: RoleId) {
  return ROLE_REGISTRY.find((role) => role.id === roleId) ?? ROLE_REGISTRY[0]!;
}

export function getRoleName(roleId: RoleId): string {
  return getRoleDefinition(roleId).name;
}

export function getShortRoleName(roleId: RoleId): string {
  return getRoleName(roleId).replace(" Agent", "");
}

export function findRoleByDepartment(department: DepartmentId) {
  return ROLE_REGISTRY.find((role) => role.department === department);
}

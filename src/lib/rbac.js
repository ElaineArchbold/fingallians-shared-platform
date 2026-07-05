import { SQUADS } from "../config/squads";

export function rolesForSquad(roles, squadConfig) {
  return (roles || []).filter(
    role => role.squad_key === squadConfig.key
  );
}

export function hasRoleForSquad(roles, squadConfig, roleName) {
  return rolesForSquad(roles, squadConfig).some(
    role => role.role === roleName
  );
}

export function isSuperAdminForSquad(roles, squadConfig) {
  return hasRoleForSquad(roles, squadConfig, "super_admin");
}

export function isAdminForSquad(roles, squadConfig) {
  return (
    isSuperAdminForSquad(roles, squadConfig) ||
    hasRoleForSquad(roles, squadConfig, "admin")
  );
}

export function adminSquadKeysForRoles(roles) {
  return Object.entries(SQUADS)
    .filter(([, squad]) =>
      (roles || []).some(
        role =>
          role.squad_key === squad.key &&
          (role.role === "admin" || role.role === "super_admin")
      )
    )
    .map(([key]) => key);
}
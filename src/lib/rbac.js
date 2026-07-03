import { SQUADS, squadNameMatches } from "../config/squads";

export function rolesForSquad(roles, squadConfig) {
  return (roles || []).filter(role => squadNameMatches(role.squad, squadConfig));
}

export function hasRoleForSquad(roles, squadConfig, roleName) {
  return rolesForSquad(roles, squadConfig).some(role => role.role === roleName);
}

export function isSuperAdminForSquad(roles, squadConfig) {
  return hasRoleForSquad(roles, squadConfig, "super_admin");
}

export function isAdminForSquad(roles, squadConfig) {
  return isSuperAdminForSquad(roles, squadConfig) || hasRoleForSquad(roles, squadConfig, "admin");
}

export function adminSquadKeysForRoles(roles) {
  return Object.entries(SQUADS)
    .filter(([, squad]) => isAdminForSquad(roles, squad))
    .map(([key]) => key);
}

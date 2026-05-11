export type ModuleKey =
  | "dashboard"
  | "crm"
  | "precon"
  | "revenue"
  | "drive"
  | "estimating"
  | "branding"
  | "team"
  | "billing"
  | "settings";

export type Permission = "read" | "write" | "edit" | "delete";

export type RoleKey =
  | "super_admin"
  | "owner"
  | "admin"
  | "bookkeeper"
  | "estimator"
  | "pm"
  | "office"
  | "field_foreman"
  | string;

export const MODULES: ModuleKey[] = [
  "dashboard",
  "crm",
  "precon",
  "revenue",
  "drive",
  "estimating",
  "branding",
  "team",
  "billing",
  "settings",
];

export const FIELD_ROLE_KEYS = new Set<RoleKey>(["field_foreman"]);

export function isFieldRole(roleKey: RoleKey): boolean {
  return FIELD_ROLE_KEYS.has(roleKey);
}

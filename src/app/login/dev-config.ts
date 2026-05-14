export const DEV_LOGIN_EMAIL = "dev@1collective.local";
export const DEV_LOGIN_PASSWORD = "DevPassword123!";

export function isDevLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_LOGIN === "1"
  );
}

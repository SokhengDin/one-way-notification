import { runApi } from "../api-client";

export const getMe = () => runApi((client) => client.auth.me());

/** Ends the session (API and cookie), then shows the sign-in page. */
export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  window.location.assign("/login");
}

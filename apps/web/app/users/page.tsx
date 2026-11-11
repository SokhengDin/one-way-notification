import { redirect } from "next/navigation";

// Users live under their external system now (External systems → a system → Users).
export default function LegacyUsersPage() {
  redirect("/external-systems");
}

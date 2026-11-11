import { redirect } from "next/navigation";

// A user is added inside the external system they belong to.
export default function LegacyNewUserPage() {
  redirect("/external-systems");
}

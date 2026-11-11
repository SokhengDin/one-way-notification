import { redirect } from "next/navigation";

// Old contact pages (/users/:id/contacts/…): the user's page finds their system.
export default async function LegacyUserSubpage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/users/${id}`);
}

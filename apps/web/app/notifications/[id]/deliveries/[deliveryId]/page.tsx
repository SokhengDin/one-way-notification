import { redirect } from "next/navigation";

// Deliveries have their own page now; keep old links working.
export default async function LegacyDeliveryPage({ params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  redirect(`/deliveries/${deliveryId}`);
}

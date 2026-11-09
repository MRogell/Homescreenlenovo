import { requireUser } from "@/server/authz";
import { getDepartureView } from "@/server/departure/tick";
import { getSettings } from "@/server/settings";
import { getHomeStates } from "@/server/snapshots";
import { HomeScreen } from "@/components/home/home-screen";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  const now = new Date();
  const [initial, settings] = await Promise.all([getHomeStates(now), getSettings()]);
  const departure = await getDepartureView(initial, now);
  return <HomeScreen initial={initial} initialNow={now.toISOString()} initialSettings={settings} initialDeparture={departure} />;
}

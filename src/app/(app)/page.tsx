import { requireUser } from "@/server/authz";
import { getHomeStates } from "@/server/snapshots";
import { HomeScreen } from "@/components/home/home-screen";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireUser();
  const now = new Date();
  return <HomeScreen initial={await getHomeStates(now)} initialNow={now.toISOString()} />;
}

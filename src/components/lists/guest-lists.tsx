"use client";
import { ListsPanel, useLists } from "./lists-panel";
import { PickupBar } from "./pickup-bar";

/** Familjemedlemmens vy: hela listan och lapparna, med den egna länkens adress som källa. */
export function GuestLists({ token }: { token: string }) {
  const api = useLists(null, { endpoint: `/api/share/${token}/lists`, storeKey: `lists-share-${token.slice(0, 10)}` });
  return (
    <>
      {api.loaded && <PickupBar api={api} />}
      <ListsPanel api={api} mode="page" handlaHref={`/familj/${token}/handla`} />
    </>
  );
}

"use client";
import { doneItems } from "@/lib/shopping";
import type { ListsData } from "@/server/providers/schemas";
import type { CardState } from "@/server/providers/types";
import { ListsPanel, useLists } from "../lists/lists-panel";
import { CardShell } from "./card-shell";

const OFF = { big: "Listan", text: "Handla tillsammans.", cta: "Öppna listan" };

function Live({ state, now }: { state: Extract<CardState<ListsData>, { status: "ok" | "stale" }>; now: Date }) {
  const api = useLists(state.data);
  const done = doneItems(api.state.items).length;
  const open = api.state.items.length - done;
  // Pillret följer det som syns, inte det som hämtades senast.
  const pill = open > 0 ? { text: `${open} att handla` } : done > 0 ? { text: "Allt i korgen", tone: "ok" as const } : { text: "Tom lista" };
  return <CardShell<ListsData> title="Inköp" icon="cart" off={OFF} state={state} now={now} className="lists" noFoot render={() => ({ pill, body: <ListsPanel api={api} mode="card" /> })} />;
}

/** Inköpslista och lappar: delas av alla i familjen, och finns i stor vy för butiken (/handla). */
export function ListsCard({ state, now }: { state: CardState<unknown> | undefined; now: Date }) {
  const s = state as CardState<ListsData> | undefined;
  if (s && (s.status === "ok" || s.status === "stale")) return <Live state={s} now={now} />;
  return <CardShell<ListsData> title="Inköp" icon="cart" off={OFF} state={s} now={now} className="lists" render={() => ({ body: null })} />;
}

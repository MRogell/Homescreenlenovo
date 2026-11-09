"use client";
import { ListsPanel, useLists } from "./lists-panel";

/** Handlaläget: listan i stor vy. Startar utan data och tar upp det som sparats i telefonen. */
export function ShoppingMode() {
  const api = useLists(null);
  return <ListsPanel api={api} mode="full" />;
}

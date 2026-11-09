"use client";
import { ListsPanel, useLists } from "./lists-panel";

/** Handlaläget: listan i stor vy. Startar utan data och tar upp det som sparats i telefonen. */
export function ShoppingMode({ endpoint, storeKey }: { endpoint?: string; storeKey?: string }) {
  const api = useLists(null, { endpoint, storeKey });
  return <ListsPanel api={api} mode="shop" />;
}

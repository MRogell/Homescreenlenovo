import type { ListsState } from "@/lib/shopping";
import { listsSchema, type ListsData } from "./schemas";
import type { Provider } from "./types";

export interface ListsDeps { load: () => Promise<ListsState> }

/** Inköpslista och lappar ligger i vår egen databas: ingen anslutning behövs och inget kan "inte svara" utom databasen själv. */
export function createListsProvider(deps: ListsDeps): Provider<ListsData> {
  return {
    id: "lists",
    // Kort tid: familjen lägger till och bockar av hela tiden. Egna ändringar tömmer cachen direkt.
    ttlSeconds: 10,
    schema: listsSchema,
    sourceLabel: "Egen lista (sparas i databasen)",
    async getSummary() {
      return deps.load();
    },
  };
}

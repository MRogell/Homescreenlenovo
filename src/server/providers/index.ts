import { demoProviders } from "./demo";
import type { Provider, ProviderId } from "./types";
import { PROVIDER_IDS } from "./types";

export const PROVIDERS: Provider<unknown>[] = PROVIDER_IDS.map((id) => demoProviders[id]);
export type { ProviderId };

"use client";
import { createContext, useContext } from "react";

/** Låter ett kort be hemskärmen hämta ny data direkt (t.ex. efter att uppspelning styrts). */
export const RefreshContext = createContext<() => Promise<void> | void>(() => {});
export const useRefresh = () => useContext(RefreshContext);

/** Hämtar bara Spotifys läge, direkt från Spotify (snabbt, utan hemskärmens cache). */
export const SpotifyRefreshContext = createContext<() => Promise<void> | void>(() => {});
export const useRefreshSpotify = () => useContext(SpotifyRefreshContext);

"use client";
import { createContext, useContext } from "react";

/** Låter ett kort be hemskärmen hämta ny data direkt (t.ex. efter att uppspelning styrts). */
export const RefreshContext = createContext<() => Promise<void> | void>(() => {});
export const useRefresh = () => useContext(RefreshContext);

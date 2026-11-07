/**
 * Länkar till Google Home. Appen går inte att bädda in i hemskärmen, så rutan öppnar den i stället.
 *
 * Android: en intent-länk via Play Butiken ("launch") som startar Google Home-appen om den finns, annars webbversionen
 * (browser_fallback_url). Mekanismen är inte provad mot plattan härifrån; webbversionen visas därför alltid som ett eget val.
 */
export const GOOGLE_HOME_PACKAGE = "com.google.android.apps.chromecast.app";
export const GOOGLE_HOME_WEB = "https://home.google.com";

export interface GoogleHomeLinks {
  /** Bara på Android. */
  app?: string;
  web: string;
}

export function googleHomeLinks(userAgent: string | undefined): GoogleHomeLinks {
  if (!userAgent || !/Android/i.test(userAgent)) return { web: GOOGLE_HOME_WEB };
  const app = `intent://launch?id=${GOOGLE_HOME_PACKAGE}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(GOOGLE_HOME_WEB)};end`;
  return { app, web: GOOGLE_HOME_WEB };
}

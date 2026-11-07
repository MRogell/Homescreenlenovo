/** WMO-väderkod (Open-Meteo `weather_code`) till svensk text. */
export function weatherText(code: number): string {
  if (code === 0) return "Klart";
  if (code === 1) return "Mestadels klart";
  if (code === 2) return "Halvklart";
  if (code === 3) return "Mulet";
  if (code === 45 || code === 48) return "Dimma";
  if (code >= 51 && code <= 55) return "Duggregn";
  if (code === 56 || code === 57) return "Underkylt duggregn";
  if (code === 61) return "Lätt regn";
  if (code === 63) return "Regn";
  if (code === 65) return "Kraftigt regn";
  if (code === 66 || code === 67) return "Underkylt regn";
  if (code === 71) return "Lätt snöfall";
  if (code === 73) return "Snöfall";
  if (code === 75) return "Kraftigt snöfall";
  if (code === 77) return "Snökorn";
  if (code >= 80 && code <= 82) return "Regnskurar";
  if (code === 85 || code === 86) return "Snöbyar";
  if (code === 95) return "Åska";
  if (code === 96 || code === 99) return "Åska med hagel";
  return "Okänt väder";
}

/** Europeiskt luftkvalitetsindex (European AQI) till svensk nivå. */
export function aqiLabel(aqi: number): string {
  if (aqi <= 20) return "Bra";
  if (aqi <= 40) return "Ganska bra";
  if (aqi <= 60) return "Måttlig";
  if (aqi <= 80) return "Dålig";
  if (aqi <= 100) return "Mycket dålig";
  return "Extremt dålig";
}

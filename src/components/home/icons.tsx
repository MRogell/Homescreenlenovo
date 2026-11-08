const P = {
  car: "M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2M20 16v2M7 12h10",
  spk: "M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM12 12.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM12 6.5v2",
  note: "M9 18V6l10-2v12M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  temp: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  wash: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 9a4.2 4.2 0 1 0 0 8.4A4.2 4.2 0 0 0 12 9zM7 6.5h2",
  cal: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
  cloud: "M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z",
  lock: "M8 11V8a4 4 0 0 1 8 0v3M6 11h12v9H6zM12 15v2",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h1",
  window: "M5 5h14v14H5zM12 5v14M5 12h14",
  trunk: "M3 13h18v5H3zM6 13l2-6h8l2 6M7 18v2M17 18v2",
  pin: "M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6z",
} as const;
export type IconName = keyof typeof P;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={P[name]} /></svg>;
}

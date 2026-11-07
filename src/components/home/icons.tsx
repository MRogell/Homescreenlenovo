const P = {
  car: "M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2M20 16v2M7 12h10",
  spk: "M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM12 12.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM12 6.5v2",
  note: "M9 18V6l10-2v12M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  temp: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  wash: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 9a4.2 4.2 0 1 0 0 8.4A4.2 4.2 0 0 0 12 9zM7 6.5h2",
  cam: "M3 8h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 12l5-3v8l-5-3",
} as const;
export type IconName = keyof typeof P;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={P[name]} /></svg>;
}

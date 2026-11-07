/** Hjälpmedel för tester: svarar på URL:er som slutar med en given sökväg. Ligger utanför testfilerna så att båda kan använda den. */
export type FakeRoute = { status?: number; body?: unknown; headers?: Record<string, string>; raw?: string };

export function fakeFetch(routes: Record<string, FakeRoute>) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response("{}", { status: 404 });
    const r = routes[key]!;
    const status = r.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), { status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

"use client";
import { Music } from "lucide-react";
import { useEffect, useRef } from "react";
import { tintFromPixels } from "./spotify-view";

/** Omslag. När bilden laddats sätts en svag färgton på hela kortet (--sp-tint); misslyckas läsningen blir kortet neutralt. */
export function SpotifyArt({ url, dim }: { url: string | null; dim: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = box.current?.closest<HTMLElement>(".card");
    if (!url) card?.style.removeProperty("--sp-tint");
  }, [url]);

  function onLoad() {
    const img = ref.current;
    const card = box.current?.closest<HTMLElement>(".card");
    if (!img || !card) return;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 12;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 12, 12);
      const tint = tintFromPixels(ctx.getImageData(0, 0, 12, 12).data);
      if (tint) card.style.setProperty("--sp-tint", tint);
      else card.style.removeProperty("--sp-tint");
    } catch {
      // Bilden får inte läsas (CORS): ingen färgton.
      card.style.removeProperty("--sp-tint");
    }
  }

  return (
    <div className={`sp-art${dim ? " dim" : ""}`} ref={box}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- extern bild från Spotify, ingen optimering behövs
        <img ref={ref} src={url} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onLoad={onLoad} />
      ) : (
        <Music aria-hidden="true" />
      )}
    </div>
  );
}

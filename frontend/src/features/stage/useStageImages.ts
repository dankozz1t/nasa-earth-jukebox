import { useEffect, useMemo, useState } from "react";
import type { Soundscape } from "../../shared/api";
import { decodeClassMap } from "../aerosols";
import { pixels } from "./draw-aerosols";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

type ImageStatus = "idle" | "loading" | "ready" | "error";

export function useImageStatus(url: string | undefined): {
  img: HTMLImageElement | null;
  status: ImageStatus;
} {
  const [result, setResult] = useState<{ url: string; img: HTMLImageElement | null } | null>(null);

  useEffect(() => {
    if (!url) return;

    let live = true;
    const settle = (img: HTMLImageElement | null) => {
      if (live) setResult({ url, img });
    };
    // On error the stage keeps its dark ground; the sound still plays.
    loadImage(url).then(settle, () => settle(null));

    return () => {
      live = false;
    };
  }, [url]);

  if (!url) return { img: null, status: "idle" };
  if (!result || result.url !== url) return { img: null, status: "loading" };
  return result.img ? { img: result.img, status: "ready" } : { img: null, status: "error" };
}

export function useImage(url: string | undefined): HTMLImageElement | null {
  return useImageStatus(url).img;
}

// One decode per soundscape: the stage fills the cache while it draws, and the Save menu reads it.
const classMaps = new WeakMap<Soundscape, Uint8Array>();

function decodeFrom(s: Soundscape, png: HTMLImageElement): Uint8Array {
  const map = decodeClassMap(pixels(document, png, s.width, s.height).data);
  classMaps.set(s, map);
  return map;
}

export function useClassMap(s: Soundscape | undefined): Uint8Array | null {
  const png = useImage(s?.artifacts.classMap);

  return useMemo(() => {
    if (!s || !png || !s.width || !s.height) return null;
    return classMaps.get(s) ?? decodeFrom(s, png);
  }, [s, png]);
}

export async function loadClassMap(s: Soundscape): Promise<Uint8Array> {
  return classMaps.get(s) ?? decodeFrom(s, await loadImage(s.artifacts.classMap));
}

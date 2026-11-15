import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getPlayer } from "./player-instance";
import type { PlayerSnapshot } from "./stem-player";

export function usePlayer(): PlayerSnapshot {
  const player = getPlayer();
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}

export function usePosition(fps = 10): number {
  const { playing } = usePlayer();
  const player = getPlayer();

  // The snapshot does not carry a paused position that moved (seek, stop).
  useSyncExternalStore(player.subscribe, player.getPositionRev, player.getPositionRev);

  const [position, setPosition] = useState(() => player.position);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;

    const player = getPlayer();
    const interval = 1000 / fps;
    let raf = 0;
    const tick = (now: number) => {
      if (now - last.current >= interval) {
        last.current = now;
        setPosition(player.position);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps]);

  return playing ? position : player.position;
}

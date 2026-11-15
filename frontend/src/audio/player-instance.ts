import { Narrator } from "./narrator";
import { StemPlayer } from "./stem-player";

// Lazy, so nothing touches AudioContext or speechSynthesis before the first use.
let player: StemPlayer | null = null;
let narrator: Narrator | null = null;

export function getPlayer(): StemPlayer {
  return (player ??= new StemPlayer());
}

export function getNarrator(): Narrator {
  return (narrator ??= new Narrator());
}

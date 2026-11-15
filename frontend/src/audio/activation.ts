// Browsers start audio only after the person has interacted with the page (a click, a tap, a key). From
// then on a plain hover may start sound too. `userActivation` is missing in older Safari and in jsdom.
let active = false;

const mark = () => {
  active = true;
};

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", mark, { capture: true });
  window.addEventListener("keydown", mark, { capture: true });
}

export function canStartAudio(): boolean {
  return navigator.userActivation?.hasBeenActive ?? active;
}

export function resetAudioActivation(): void {
  active = false;
}

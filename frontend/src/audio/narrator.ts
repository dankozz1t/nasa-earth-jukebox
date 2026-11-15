import type { Lang } from "../shared/i18n";

const LOCALES: Record<Lang, string> = { en: "en", uk: "uk" };

function findVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(LOCALES[lang]));
}

// Off by default: screen-reader users already hear the aria-live text, double speech would be noise.
export class Narrator {
  enabled = false;
  rate = 1;
  lang: Lang = "en";

  get supported(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance === "function"
    );
  }

  hasVoice(lang: Lang = this.lang): boolean {
    if (!this.supported) return false;

    return findVoice(lang) !== undefined;
  }

  speak(text: string, opts: { interrupt?: boolean; force?: boolean } = {}): void {
    if (!this.supported || (!this.enabled && !opts.force) || !text) return;
    if (opts.interrupt !== false) speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const voice = findVoice(this.lang);
    if (voice) u.voice = voice;
    u.lang = this.lang === "uk" ? "uk-UA" : "en-US";
    u.rate = this.rate;
    speechSynthesis.speak(u);
  }

  get speaking(): boolean {
    return this.supported && speechSynthesis.speaking;
  }

  stop(): void {
    if (this.supported) speechSynthesis.cancel();
  }
}

// Longer pulses for louder layers. Only Android browsers implement navigator.vibrate.
export function vibrateFor(strengths: number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;

  const top = Math.max(0, ...strengths);
  if (top <= 0) return;

  const count = strengths.filter((s) => s > 0.05).length;
  const pattern: number[] = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    pattern.push(Math.round(15 + 60 * top), 40);
  }

  navigator.vibrate(pattern);
}

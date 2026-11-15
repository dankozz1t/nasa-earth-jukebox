import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { useOverlay } from "../src/shared/lib/overlays";

afterEach(() => {
  cleanup();
  useOverlay.setState({ open: null });
});

// jsdom has no <dialog> modal API; mirror the open attribute so tests see what a browser would.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

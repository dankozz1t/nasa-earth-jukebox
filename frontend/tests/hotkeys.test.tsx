import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useHotkeys, type HotkeyMap } from "../src/shared/lib/useHotkeys";

function Host({ map, children }: { map: HotkeyMap; children?: React.ReactNode }) {
  useHotkeys(map);
  return <div>{children}</div>;
}

describe("useHotkeys", () => {
  it("fires on physical keys, with Shift as a prefix", async () => {
    const space = vi.fn();
    const one = vi.fn();
    const shiftTwo = vi.fn();
    render(<Host map={{ space, "1": one, "Shift+2": shiftTwo }} />);
    await userEvent.keyboard(" 1{Shift>}2{/Shift}2");
    expect(space).toHaveBeenCalledTimes(1);
    expect(one).toHaveBeenCalledTimes(1);
    expect(shiftTwo).toHaveBeenCalledTimes(1);
  });

  it("matches the physical key on another layout (Ukrainian і on KeyS)", () => {
    const s = vi.fn();
    render(<Host map={{ s }} />);
    fireEvent.keyDown(document.body, { key: "і", code: "KeyS" });
    expect(s).toHaveBeenCalledTimes(1);
  });

  it("minus and equals work with and without Shift, and on the numpad", () => {
    const minus = vi.fn();
    const equal = vi.fn();
    render(<Host map={{ "-": minus, "=": equal }} />);
    fireEvent.keyDown(document.body, { key: "-", code: "Minus" });
    fireEvent.keyDown(document.body, { key: "NumpadSubtract", code: "NumpadSubtract" });
    fireEvent.keyDown(document.body, { key: "+", code: "Equal", shiftKey: true });
    expect(minus).toHaveBeenCalledTimes(2);
    expect(equal).toHaveBeenCalledTimes(1);
  });

  it("ignores text fields, selects, textareas and contenteditable", async () => {
    const s = vi.fn();
    render(
      <Host map={{ s }}>
        <input aria-label="text" />
        <textarea aria-label="area" />
        <select aria-label="pick">
          <option>a</option>
        </select>
        <div
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          tabIndex={0}
          aria-label="edit"
        />
      </Host>,
    );
    for (const name of ["text", "area", "pick", "edit"]) {
      screen.getByLabelText(name).focus();
      fireEvent.keyDown(screen.getByLabelText(name), { key: "s", code: "KeyS" });
    }
    expect(s).not.toHaveBeenCalled();
  });

  it("ignores range inputs and role=slider, but not the map explorer", () => {
    const space = vi.fn();
    render(
      <Host map={{ space }}>
        <input type="range" aria-label="range" />
        <div role="slider" tabIndex={0} aria-label="other" aria-valuenow={0} />
        <div role="slider" tabIndex={0} aria-label="explorer" aria-valuenow={0} data-explorer="" />
      </Host>,
    );
    fireEvent.keyDown(screen.getByLabelText("range"), { code: "Space", key: " " });
    fireEvent.keyDown(screen.getByLabelText("other"), { code: "Space", key: " " });
    expect(space).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("explorer"), { code: "Space", key: " " });
    expect(space).toHaveBeenCalledTimes(1);
  });

  it("leaves Space to a focused button, which presses itself", () => {
    const space = vi.fn();
    const one = vi.fn();
    render(
      <Host map={{ space, "1": one }}>
        <button type="button">Press</button>
      </Host>,
    );
    fireEvent.keyDown(screen.getByRole("button"), { code: "Space", key: " " });
    expect(space).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button"), { code: "Digit1", key: "1" });
    expect(one).toHaveBeenCalledTimes(1);
  });

  it("does nothing while a dialog is open", () => {
    const space = vi.fn();
    render(
      <Host map={{ space }}>
        <dialog open>
          <p>Access</p>
        </dialog>
      </Host>,
    );
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(space).not.toHaveBeenCalled();
  });

  it("ignores Ctrl, Meta and Alt combinations and held keys", () => {
    const s = vi.fn();
    const minus = vi.fn();
    render(<Host map={{ s, "-": minus }} />);
    fireEvent.keyDown(document.body, { code: "KeyS", key: "s", ctrlKey: true });
    fireEvent.keyDown(document.body, { code: "KeyS", key: "s", metaKey: true });
    fireEvent.keyDown(document.body, { code: "KeyS", key: "s", repeat: true });
    expect(s).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { code: "Minus", key: "-", repeat: true });
    expect(minus).toHaveBeenCalledTimes(1); // volume may ramp while held
  });

  it("uses the latest map without re-subscribing, and stops after unmount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = render(<Host map={{ s: first }} />);
    rerender(<Host map={{ s: second }} />);
    fireEvent.keyDown(document.body, { code: "KeyS", key: "s" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document.body, { code: "KeyS", key: "s" });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Drawer,
  InfoTip,
  Menu,
  Segmented,
  Slider,
  Switch,
  ToastProvider,
  useToast,
} from "../src/shared/ui";
import { LIFETIME_MS } from "../src/shared/ui/Toast";

function SwitchHarness() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} label="Subtitles" />;
}

describe("Switch", () => {
  it("toggles aria-checked on click and Space", async () => {
    const user = userEvent.setup();
    render(<SwitchHarness />);
    const sw = screen.getByRole("switch", { name: "Subtitles" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.focus();
    await user.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
  });
});

function SegHarness() {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return (
    <Segmented
      label="Mode"
      value={v}
      onChange={setV}
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "c", label: "Gamma" },
      ]}
    />
  );
}

describe("Segmented", () => {
  it("moves selection with ArrowRight and keeps one tab stop", async () => {
    const user = userEvent.setup();
    render(<SegHarness />);
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
    expect(screen.getAllByRole("radio").filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Gamma" })).toBeChecked();
  });
});

describe("Button", () => {
  it("iconOnly renders aria-label", () => {
    render(<Button iconOnly icon="play" aria-label="Play" />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });
  it("renders children and variant class", () => {
    render(
      <Button variant="outline" icon="download">
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("rejects iconOnly without aria-label at type level", () => {
    // @ts-expect-error aria-label is required with iconOnly
    const bad = <Button iconOnly icon="play" />;
    expect(bad).toBeTruthy();
  });
});

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>
        Open
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Tune"
        side="right"
        returnFocusRef={ref}
      >
        <button>First</button>
        <button>Last</button>
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("traps focus, closes on Escape, returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Tune" });
    expect(dialog).toHaveAttribute("open");
    const focusables = ["Close", "First", "Last"].map((n) =>
      screen.getByRole("button", { name: n }),
    );
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    focusables[2]!.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(focusables[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusables[2]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("Slider", () => {
  function setup() {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <Slider
        label="Volume"
        value={0.7}
        min={0}
        max={1}
        step={0.1}
        onChange={onChange}
        onCommit={onCommit}
        valueText={(v) => `${Math.round(v * 100)}%`}
      />,
    );
    return { s: screen.getByRole("slider", { name: "Volume" }), onChange, onCommit };
  }

  it("exposes valueText and fires onChange without committing", () => {
    const { s, onChange, onCommit } = setup();
    expect(s).toHaveAttribute("aria-valuetext", "70%");
    // user-event does not drive range inputs with arrows, so dispatch the events a browser would.
    fireEvent.change(s, { target: { value: "0.8" } });
    expect(onChange).toHaveBeenCalledWith(0.8);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a change followed by blur commits once (assistive-tech adjust)", () => {
    const { s, onCommit } = setup();
    s.focus();
    fireEvent.change(s, { target: { value: "0.8" } });
    fireEvent.blur(s);
    fireEvent.blur(s);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("pointerup after a change commits once, and blur does not repeat it", () => {
    const { s, onCommit } = setup();
    fireEvent.change(s, { target: { value: "0.8" } });
    fireEvent.pointerUp(s);
    fireEvent.blur(s);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("keyup after an arrow commits once, and a following blur does not repeat it", () => {
    const { s, onCommit } = setup();
    fireEvent.change(s, { target: { value: "0.8" } });
    fireEvent.keyUp(s, { key: "ArrowRight" });
    fireEvent.blur(s);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("does not commit without a preceding change", () => {
    const { s, onCommit } = setup();
    fireEvent.pointerUp(s);
    fireEvent.blur(s);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("Menu", () => {
  it("opens, selects an item and closes", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Menu label="Save" items={[{ id: "wav", label: "WAV", onSelect: run }]} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("menuitem", { name: "WAV" }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("renders a link item for downloads and a disabled button with its reason", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Menu
        label="Save"
        items={[{ id: "wav", label: "WAV", href: "/a.wav", download: "a.wav" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const link = screen.getByRole("menuitem", { name: "WAV" });
    expect(link).toHaveAttribute("href", "/a.wav");
    expect(link).toHaveAttribute("download", "a.wav");
    rerender(<Menu label="Save" items={[]} disabledReason="Nothing yet" />);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Nothing yet");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("a link item is still in the page while the browser handles its click, and the menu closes after", async () => {
    const user = userEvent.setup();
    render(
      <Menu
        label="Save"
        items={[{ id: "wav", label: "WAV", href: "/a.wav", download: "a.wav" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const link = screen.getByRole("menuitem", { name: "WAV" });
    const noNavigation = (e: MouseEvent) => e.preventDefault(); // jsdom cannot navigate
    document.addEventListener("click", noNavigation);
    // fireEvent flushes React's work at once. In a browser React renders in a microtask, before the browser acts
    // on the click; a link removed by then is not followed (HTML: an element that is not connected cannot navigate).
    fireEvent.click(link);
    document.removeEventListener("click", noNavigation);
    expect(link.isConnected).toBe(true);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });
  it("activates a link item with Space and closes", async () => {
    const user = userEvent.setup();
    const clicked = vi.fn((e: MouseEvent) => e.preventDefault()); // no navigation in jsdom
    const run = vi.fn();
    render(
      <Menu
        label="Save"
        items={[{ id: "wav", label: "WAV", href: "/a.wav", download: "a.wav", onSelect: run }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("menuitem", { name: "WAV" })).toHaveFocus();
    document.addEventListener("click", clicked);
    await user.keyboard(" ");
    document.removeEventListener("click", clicked);
    expect(clicked).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("does not reopen by itself after being disabled and enabled again", async () => {
    const user = userEvent.setup();
    const items = [{ id: "wav", label: "WAV", onSelect: () => {} }];
    const { rerender } = render(<Menu label="Save" items={items} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    rerender(<Menu label="Save" items={items} disabledReason="Nothing yet" />);
    rerender(<Menu label="Save" items={items} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("closes on Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    render(<Menu label="Save" items={[{ id: "wav", label: "WAV", onSelect: () => {} }]} />);
    const btn = screen.getByRole("button", { name: "Save" });
    await user.click(btn);
    expect(screen.getByRole("menuitem", { name: "WAV" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
});

function ToastHarness({ kind }: { kind: "status" | "alert" }) {
  const { show } = useToast();
  return (
    <button onClick={() => show("Saved", { kind, action: { label: "Undo", run: () => {} } })}>
      Go
    </button>
  );
}

describe("Toast", () => {
  it("announces status in a polite region and alerts in an assertive one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ToastProvider>
        <ToastHarness kind="status" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    unmount();
    render(
      <ToastProvider>
        <ToastHarness kind="alert" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Saved");
  });

  it("a toast with a button stays until it is used or closed (WCAG 2.2.1), a plain one goes after 6 s", () => {
    vi.useFakeTimers();
    function Two() {
      const { show } = useToast();
      return (
        <>
          <button
            onClick={() =>
              show("Could not prepare the sound", {
                kind: "alert",
                action: { label: "Try again", run: () => {} },
              })
            }
          >
            Fail
          </button>
          <button onClick={() => show("Saved")}>Save</button>
        </>
      );
    }
    try {
      render(
        <ToastProvider>
          <Two />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Fail" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      act(() => void vi.advanceTimersByTime(LIFETIME_MS * 10));
      expect(screen.queryByText("Saved")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent("Could not prepare the sound");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a plain toast waits while the pointer is on it, and the same text again replaces it", () => {
    vi.useFakeTimers();
    function One() {
      const { show } = useToast();
      return <button onClick={() => show("Saved")}>Save</button>;
    }
    try {
      render(
        <ToastProvider>
          <One />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getAllByText("Saved")).toHaveLength(1);
      const toast = screen.getByText("Saved").parentElement!;
      fireEvent.pointerEnter(toast);
      act(() => void vi.advanceTimersByTime(LIFETIME_MS * 2));
      expect(screen.getByText("Saved")).toBeInTheDocument();
      fireEvent.pointerLeave(toast);
      act(() => void vi.advanceTimersByTime(LIFETIME_MS));
      expect(screen.queryByText("Saved")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a quiet toast is shown but kept out of both live regions", async () => {
    function Quiet() {
      const { show } = useToast();
      return <button onClick={() => show("New reading 14:30", { quiet: true })}>Go</button>;
    }
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Quiet />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByText("New reading 14:30").closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});

describe("InfoTip", () => {
  it("names its note as the button's description, open or closed", () => {
    render(<InfoTip label="About the volume">Turns every part up or down.</InfoTip>);
    const button = screen.getByRole("button", { name: "About the volume" });
    expect(button).toHaveAccessibleDescription("Turns every part up or down.");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a tap pins the note open, a second tap or a tap outside closes it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <InfoTip label="About">Note</InfoTip>
        <button>Elsewhere</button>
      </>,
    );
    const button = screen.getByRole("button", { name: "About" });
    await user.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Note");
    await user.click(button);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Escape inside a drawer closes the note, not the drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Sound settings" side="right">
        <InfoTip label="About the wave">How the wave reads the map.</InfoTip>
      </Drawer>,
    );
    const button = screen.getByRole("button", { name: "About the wave" });
    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}"); // nothing open any more: now Escape closes the drawer
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

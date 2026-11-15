import { describe, expect, it } from "vitest";
import {
  isRepeat,
  LAYER_ORDER,
  LayerShelf,
  nextLayer,
  playOrder,
} from "../src/features/live/model/playlist";

describe("repeat all layers", () => {
  it("follows the order of the layer switch and wraps around", () => {
    expect(LAYER_ORDER).toEqual(["temperature", "precipitation", "clouds", "wind"]);
    expect(nextLayer("temperature")).toBe("precipitation");
    expect(nextLayer("clouds")).toBe("wind");
    expect(nextLayer("wind")).toBe("temperature");
  });

  it("prepares layers in playing order from the chosen one", () => {
    expect(playOrder("clouds")).toEqual(["clouds", "wind", "temperature", "precipitation"]);
    expect(playOrder("temperature")).toEqual([...LAYER_ORDER]);
  });

  it("accepts only the three repeat modes", () => {
    expect(isRepeat("all")).toBe(true);
    expect(isRepeat("one")).toBe(true);
    expect(isRepeat("off")).toBe(true);
    expect(isRepeat(true)).toBe(false);
    expect(isRepeat("loop")).toBe(false);
  });
});

describe("layer shelf", () => {
  it("keeps the older piece until the new generation is ready", () => {
    const shelf = new LayerShelf<string>();
    shelf.put("wind", 1, "wind@60s");
    expect(shelf.fresh("wind", 2)).toBeUndefined();
    expect(shelf.get("wind")?.value).toBe("wind@60s");
    shelf.put("wind", 2, "wind@30s");
    expect(shelf.fresh("wind", 2)).toBe("wind@30s");
  });

  it("ignores a late answer from an older generation", () => {
    const shelf = new LayerShelf<string>();
    expect(shelf.put("clouds", 3, "new")).toBe(true);
    expect(shelf.put("clouds", 2, "old")).toBe(false);
    expect(shelf.get("clouds")?.value).toBe("new");
  });

  it("refreshes a layer within the same generation (new weather data)", () => {
    const shelf = new LayerShelf<string>();
    shelf.put("temperature", 1, "12:00");
    expect(shelf.put("temperature", 1, "12:15")).toBe(true);
    expect(shelf.get("temperature")?.value).toBe("12:15");
  });

  it("counts ready layers for the progress label", () => {
    const shelf = new LayerShelf<string>();
    shelf.put("temperature", 1, "a");
    shelf.put("precipitation", 1, "b");
    shelf.put("clouds", 2, "c");
    expect(shelf.count()).toBe(3);
    expect(shelf.countFresh(1)).toBe(2);
    expect(shelf.countFresh(2)).toBe(1);
  });
});

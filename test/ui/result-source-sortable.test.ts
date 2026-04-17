import { describe, expect, it } from "bun:test";

import { createResultSourceSortableOptions } from "../../src/ui/result-source-sortable.js";

describe("createResultSourceSortableOptions", () => {
  it("matches the demo-style handle sorting setup", () => {
    const originalImage = globalThis.Image;
    const setDataCalls: Array<[string, string]> = [];
    const setDragImageCalls: Array<[unknown, number, number]> = [];

    class FakeImage {
      src = "";
      width = 0;
      height = 0;
    }

    globalThis.Image = FakeImage as unknown as typeof Image;

    const options = createResultSourceSortableOptions({
      onEnd: async () => {}
    });

    try {
      expect(options).toMatchObject({
        animation: 200,
        handle: "[data-drag-handle]"
      });

      options.setData?.({
        setData(format: string, value: string) {
          setDataCalls.push([format, value]);
        },
        setDragImage(image: unknown, x: number, y: number) {
          setDragImageCalls.push([image, x, y]);
        }
      } as unknown as DataTransfer, {
        textContent: "Bookmarks"
      } as HTMLElement);

      expect(setDataCalls).toEqual([["text/plain", "Bookmarks"]]);
      expect(setDragImageCalls).toHaveLength(1);

      expect(options.direction).toBeUndefined();
      expect(options.easing).toBeUndefined();
      expect(options.ghostClass).toBeUndefined();
      expect(options.chosenClass).toBeUndefined();
      expect(options.dragClass).toBeUndefined();
      expect(options.invertSwap).toBeUndefined();
      expect(options.swapThreshold).toBeUndefined();
      expect(options.forceFallback).toBeUndefined();
      expect(options.fallbackClass).toBeUndefined();
      expect(options.fallbackTolerance).toBeUndefined();
    } finally {
      globalThis.Image = originalImage;
    }
  });
});

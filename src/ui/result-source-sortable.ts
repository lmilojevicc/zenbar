import type Sortable from "sortablejs";

interface ResultSourceSortableHandlers {
  onEnd: NonNullable<Sortable.SortableOptions["onEnd"]>;
}

const TRANSPARENT_DRAG_IMAGE_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

let transparentDragImage: HTMLImageElement | null = null;

export function createResultSourceSortableOptions({ onEnd }: ResultSourceSortableHandlers): Sortable.SortableOptions {
  return {
    animation: 200,
    handle: "[data-drag-handle]",
    setData: (dataTransfer, dragEl) => {
      dataTransfer.setData("text/plain", dragEl.textContent?.trim() || "");

      const dragImage = getTransparentDragImage();

      if (dragImage && typeof dataTransfer.setDragImage === "function") {
        dataTransfer.setDragImage(dragImage, 0, 0);
      }
    },
    onEnd
  };
}

function getTransparentDragImage(): HTMLImageElement | null {
  if (typeof Image !== "function") {
    return null;
  }

  if (!transparentDragImage) {
    transparentDragImage = new Image();
    transparentDragImage.src = TRANSPARENT_DRAG_IMAGE_URL;
    transparentDragImage.width = 1;
    transparentDragImage.height = 1;
  }

  return transparentDragImage;
}

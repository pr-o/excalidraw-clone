# Image crop — design

## Goal

Non-destructively trim an image element to a sub-rectangle, re-adjustable later.
Canvas, SVG, PNG and PDF export all honour the crop.

## Data model

- `ExcalidrawImageElement.crop: {x, y, width, height} | null` already exists but is unused.
  It is a rectangle in **fractions of the natural image (0..1)**; `null` = uncropped
  (equivalent to `{0,0,1,1}`). Fractions keep tools and SVG export independent of the
  image's pixel size; only the canvas draw multiplies by `naturalWidth/Height`.
- Element `x/y/width/height` stay the on-canvas box of the _visible_ region.
- Normal resize scales the box; the crop rectangle is simply sampled into it.
- No migration: the field is already persisted as `null`.

## Rendering

- Canvas (`packages/renderer/src/draw-element.ts`): when `crop` is set use
  `drawImage(img, cx, cy, cw, ch, 0, 0, w, h)`; otherwise unchanged.
- SVG (`packages/renderer/src/svg.ts`): draw the full image offset by `-crop.x*kx,
-crop.y*ky` at `kx × ky` (`kx = width/crop.width`), clipped by a `<clipPath>` rect of
  the element box. No natural size needed.
- PDF export goes through SVG, so it inherits cropping.

## Crop mode

- Double-click a single, unlocked image sets transient store field `cropElementId`
  (not persisted, not in Scene).
- While set: full image drawn dimmed, cropped region at full brightness, 8 handles.
- Dragging a handle moves that edge, updating `crop` and the element box together so
  visible pixels do not move. Edges clamp to image bounds and a minimum size.
  Pointer deltas are converted to the image's local space, so rotated images work.
- One undo step per drag.
- Exit: Escape, click elsewhere, tool/page/selection change (no Enter key event exists). Edits are kept.
- Uncropping = dragging handles back out. No reset action.

## Testing

- Unit: crop math (clamp, box/crop sync, rotation), canvas draw call, SVG output.
- E2E: double-click, drag an edge, exit, reload (persisted), export.

## Out of scope

Aspect-ratio lock, Reset crop action, special group/frame handling.

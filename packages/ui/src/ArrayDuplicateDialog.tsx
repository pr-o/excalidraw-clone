import { ARRAY_DUPLICATE_MAX_TRACKS, type ArrayDuplicateOptions } from "@excalidraw-clone/scene"
import { useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface ArrayDuplicateDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onConfirm: (opts: ArrayDuplicateOptions) => void
  className?: string
}

const FIELDS = [
  { key: "rows", testId: "array-rows", label: "arrayDuplicate.rows", min: 1 },
  { key: "cols", testId: "array-cols", label: "arrayDuplicate.cols", min: 1 },
  { key: "gapX", testId: "array-gap-x", label: "arrayDuplicate.gapX", min: undefined },
  { key: "gapY", testId: "array-gap-y", label: "arrayDuplicate.gapY", min: undefined },
] as const

export function ArrayDuplicateDialog(props: ArrayDuplicateDialogProps): React.ReactElement | null {
  // Mounting only while open resets the fields each time the dialog opens.
  if (!props.open) return null
  return <ArrayDuplicateBody {...props} />
}

function ArrayDuplicateBody({
  t,
  open,
  onClose,
  onConfirm,
  className,
}: ArrayDuplicateDialogProps): React.ReactElement {
  const [values, setValues] = useState<Record<keyof ArrayDuplicateOptions, string>>({
    rows: "1",
    cols: "3",
    gapX: "20",
    gapY: "20",
  })
  const num = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s))
  const opts: ArrayDuplicateOptions = {
    rows: num(values.rows),
    cols: num(values.cols),
    gapX: num(values.gapX),
    gapY: num(values.gapY),
  }
  const track = (n: number): boolean =>
    Number.isInteger(n) && n >= 1 && n <= ARRAY_DUPLICATE_MAX_TRACKS
  const valid =
    track(opts.rows) && track(opts.cols) && Number.isFinite(opts.gapX) && Number.isFinite(opts.gapY)
  const copies = valid ? opts.rows * opts.cols - 1 : 0

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("arrayDuplicate.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (copies > 0) onConfirm(opts)
        }}
      >
        <div className="mb-2 grid grid-cols-2 gap-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col text-sm">
              {t(f.label)}
              <input
                type="number"
                data-testid={f.testId}
                value={values[f.key]}
                min={f.min}
                max={f.min !== undefined ? ARRAY_DUPLICATE_MAX_TRACKS : undefined}
                step={1}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-28 rounded border border-panel bg-panel px-2 py-1"
              />
            </label>
          ))}
        </div>
        <p role="status" className="mb-2 text-sm">
          {t("arrayDuplicate.copies")}: <span data-testid="array-copies">{copies}</span>
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-panel px-3 py-1 text-sm"
          >
            {t("arrayDuplicate.cancel")}
          </button>
          <button
            type="submit"
            data-testid="array-duplicate-confirm"
            disabled={copies <= 0}
            className="rounded bg-accent px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {t("arrayDuplicate.confirm")}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

import { useState } from "react"
import { Dialog } from "./shared/Dialog"

export interface Sticker {
  emoji: string
  name: string
  category: string
}

const group = (category: string, items: string): Sticker[] =>
  items.split(",").map((pair) => {
    const [emoji, name] = pair.trim().split(" ") as [string, string]
    return { emoji, name: name.replace(/_/g, " "), category }
  })

/** Curated built-in set; names/categories are English search keywords. */
export const STICKERS: readonly Sticker[] = [
  ...group(
    "smileys",
    "😀 grin, 😂 joy, 😊 smile, 😍 heart_eyes, 😎 cool, 🤔 thinking, 😮 surprised, 😢 sad, 😡 angry, 😴 sleepy, 🤯 mind_blown, 🥳 party_face",
  ),
  ...group(
    "gestures",
    "👍 thumbs_up, 👎 thumbs_down, 👏 clap, 🙌 raised_hands, 👋 wave, 🤝 handshake, ✌️ peace, 👀 eyes, 💪 muscle, 🙏 pray",
  ),
  ...group(
    "animals",
    "🐱 cat, 🐶 dog, 🦊 fox, 🐻 bear, 🐼 panda, 🦁 lion, 🐸 frog, 🐧 penguin, 🦄 unicorn, 🐝 bee",
  ),
  ...group("food", "🍕 pizza, 🍔 burger, 🍩 donut, ☕ coffee, 🍎 apple, 🍰 cake, 🍺 beer, 🌮 taco"),
  ...group(
    "objects",
    "💡 idea, 🚀 rocket, 🎉 party, 🎯 target, 📌 pin, 📎 paperclip, 🔑 key, 🔒 lock, 📅 calendar, 💻 laptop, 📱 phone, 🔧 wrench, ⏰ alarm, 🏆 trophy",
  ),
  ...group(
    "symbols",
    "✅ check, ❌ cross, ⚠️ warning, ❓ question, ❗ exclamation, ❤️ heart, ⭐ star, 🔥 fire, ✨ sparkles, 💯 hundred, 🚫 forbidden, ➡️ right_arrow, ⬅️ left_arrow, ⬆️ up_arrow, ⬇️ down_arrow, 🔴 red_circle, 🟢 green_circle",
  ),
]

export interface StickerDialogProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  onPick: (emoji: string) => void
  className?: string
}

export function StickerDialog(props: StickerDialogProps): React.ReactElement | null {
  // Mounting only while open resets the search each time the dialog opens.
  if (!props.open) return null
  return <StickerBody {...props} />
}

function StickerBody({
  t,
  open,
  onClose,
  onPick,
  className,
}: StickerDialogProps): React.ReactElement {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = STICKERS.filter((s) => s.name.includes(q) || s.category.includes(q))

  return (
    <Dialog
      t={t}
      open={open}
      onClose={onClose}
      title={t("stickers.title")}
      {...(className !== undefined ? { className } : {})}
    >
      <input
        type="search"
        data-testid="sticker-search"
        aria-label={t("stickers.search")}
        placeholder={t("stickers.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        className="mb-2 block w-[22rem] max-w-full rounded border border-panel bg-panel px-2 py-1 text-sm"
      />
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{t("stickers.empty")}</p>
      ) : (
        <div className="grid max-h-72 w-[22rem] max-w-full grid-cols-8 gap-1 overflow-y-auto">
          {shown.map((s) => (
            <button
              key={s.emoji}
              type="button"
              aria-label={s.name}
              title={s.name}
              data-testid={`sticker-option-${s.name.replace(/ /g, "-")}`}
              onClick={() => onPick(s.emoji)}
              className="flex h-10 w-10 items-center justify-center rounded text-2xl hover:bg-panel-hover"
            >
              {s.emoji}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  )
}

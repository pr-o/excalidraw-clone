export const ICONS: Record<string, string> = {
  selection:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M5 3l10 6-4 1-1 4z"/></svg>',
  rectangle:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="14" height="10"/></svg>',
  ellipse:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="10" cy="10" rx="7" ry="5"/></svg>',
  diamond:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="10,3 17,10 10,17 3,10"/></svg>',
  triangle:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="10,3 17,17 3,17"/></svg>',
  parallelogram:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="7,5 18,5 13,15 2,15"/></svg>',
  hexagon:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="6,4 14,4 18,10 14,16 6,16 2,10"/></svg>',
  line: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="17" x2="17" y2="3"/></svg>',
  arrow:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="17" x2="17" y2="3"/><polyline points="11,3 17,3 17,9"/></svg>',
  freedraw:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15c2-3 4-5 7-5s5 2 7 5"/></svg>',
  text: '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><text x="3" y="15" font-family="serif" font-size="14" font-weight="700">A</text></svg>',
  image:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12"/><circle cx="7" cy="9" r="1.5" fill="currentColor"/><polyline points="3,15 8,11 12,14 17,9"/></svg>',
  eraser:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 13l7-7 5 5-7 7H6z"/></svg>',
  frame:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="6" width="12" height="9"/><line x1="2" y1="9" x2="18" y2="9"/></svg>',
  note: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h12v8l-4 4H4z"/><path d="M16 12h-4v4"/></svg>',
  hamburger:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="16" y2="10"/><line x1="4" y1="14" x2="16" y2="14"/></svg>',
  help: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 3 1.7c-.5.3-1 .6-1 1.3"/><circle cx="10" cy="14" r="0.5" fill="currentColor"/></svg>',
}

export function iconHTML(name: string): string {
  return ICONS[name] ?? ""
}

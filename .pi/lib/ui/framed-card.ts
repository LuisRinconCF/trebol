/**
 * Box-drawing frames for tool cards, in the Oh My Pi tool-card style
 * (framed rows, labeled section dividers).
 *
 * Pi's TUI contract (see .pi/lib/tools/swarm-bash.ts): a component's render()
 * must return exactly ONE array element per terminal row and no row may exceed
 * the terminal width, or the row-accounting guard tears down the whole TUI.
 * A tool that opts into `renderShell: "self"` owns its entire row budget, so
 * the frame — not Pi's padded Box — is responsible for padding, width bounds,
 * and multi-line containment.
 *
 * Dependency-free so headless extension tests can import it directly.
 */

const ANSI = /\x1b\[[0-9;:?]*[A-Za-z]/g;

const stripANSI = (value: string): string => (value.includes("\x1b") ? value.replace(ANSI, "") : value);

/**
 * Visible terminal-cell width: count code points, giving zero cells to
 * combining marks and variation selectors and two cells to the wide ranges
 * (same table as .pi/lib/tools/swarm-bash.ts rowCellWidth).
 */
export function visibleCellWidth(line: string): number {
  let width = 0;
  for (const ch of stripANSI(line)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (/\p{Mark}/u.test(ch) || cp === 0x200d || cp === 0xfe0f) continue;
    const wide = cp >= 0x1100 && (
      cp <= 0x115f || cp === 0x2329 || cp === 0x232a
      || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
      || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe10 && cp <= 0xfe6f)
      || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff)
      || (cp >= 0x20000 && cp <= 0x3fffd));
    width += wide ? 2 : 1;
  }
  return width;
}

export interface FrameSection {
  /** Divider label; omit for a continuation of the previous section. */
  label?: string;
  /** Content rows; may already contain ANSI color. Split on "\n" defensively. */
  rows: string[];
}

export interface FrameOptions {
  /** Styler for divider labels (e.g. theme.fg("muted", …)). */
  labelColor?: (text: string) => string;
}

/** `├─── Output ───…┤`, or a plain `├───…┤` divider when unlabeled. */
export function frameDivider(width: number, label?: string, labelColor?: (text: string) => string): string {
  const inner = Math.max(1, width - 2);
  if (!label) return `├${"─".repeat(inner)}┤`;
  const visible = `── ${label} `;
  const fill = Math.max(0, inner - visibleCellWidth(visible));
  const styled = labelColor ? labelColor(label) : label;
  return `├${"─".repeat(2)} ${styled} ${"─".repeat(fill)}┤`;
}

/**
 * Hard-clip a row to `cells` visible cells. ANSI escape sequences carry no
 * width but would corrupt a per-character clip, so the row is stripped to its
 * plain text first: overflowing rows lose color rather than emitting a
 * dangling escape sequence.
 */
const clipToWidth = (row: string, cells: number): string => {
  const plain = stripANSI(row);
  if (visibleCellWidth(plain) <= cells) return plain;
  let out = "", used = 0;
  for (const ch of plain) {
    const w = visibleCellWidth(ch);
    if (used + w > cells) break;
    out += ch;
    used += w;
  }
  return out;
};

/** Pad a (possibly ANSI-colored) row to exactly `inner` visible cells. */
const padRow = (row: string, inner: number): string => row + " ".repeat(Math.max(0, inner - visibleCellWidth(row)));

/**
 * Draw a full-width frame around labeled content sections.
 * Content width is `width - 4` (frame sides plus one space of padding each
 * side); callers should bound their rows to that width beforehand — rows that
 * overflow are hard-clipped to the visible width, never spilled past the frame.
 */
export function framedCard(sections: FrameSection[], width: number, options: FrameOptions = {}): string[] {
  if (width <= 0) return [""];
  // A frame needs at least two sides, two padding cells, and one content cell.
  // Below that, degrade to the bare (clipped) content rows so every row still
  // respects the terminal width guard.
  if (width < 7) {
    return sections.flatMap((s) => s.rows.flatMap((r) => r.split("\n"))).map((r) => clipToWidth(r, width));
  }
  const inner = Math.max(1, width - 4);
  const rows: string[] = [`╭${"─".repeat(Math.max(1, width - 2))}╮`];
  for (const section of sections) {
    if (section.label !== undefined) rows.push(frameDivider(width, section.label, options.labelColor));
    for (const row of section.rows) {
      for (const piece of row.split("\n")) {
        rows.push(`│ ${padRow(clipToWidth(piece, inner), inner)} │`);
      }
    }
  }
  rows.push(`╰${"─".repeat(Math.max(1, width - 2))}╯`);
  return rows;
}

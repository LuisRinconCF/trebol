/** Presentation helpers for the image-only Read tool; dependency-free for headless use. */

function textComponent(value: string) {
  return {
    render(width: number): string[] {
      if (width <= 0) return [""];
      return value.split("\n").flatMap((line) => {
        if (line.length <= width) return [line];
        const rows: string[] = [];
        for (let i = 0; i < line.length; i += width) rows.push(line.slice(i, i + width));
        return rows;
      });
    },
    invalidate() {},
  };
}

const pathFrom = (args: any): string | undefined => {
  for (const key of ["file_path", "file", "path", "filename"]) {
    if (typeof args?.[key] === "string" && args[key].length > 0) return args[key];
  }
  return undefined;
};

/** Keep range metadata tolerant: Read is image-only, but callers may supply it. */
export function formatReadCall(args: any, theme: any): string {
  const path = pathFrom(args) ?? "(path not provided)";
  const start = Number.isInteger(args?.offset) && args.offset > 0 ? args.offset : undefined;
  const limit = Number.isInteger(args?.limit) && args.limit > 0 ? args.limit : undefined;
  const range = start === undefined ? "" : ` · lines ${start}${limit === undefined ? "+" : `-${start + limit - 1}`}`;
  const title = theme?.fg?.("toolTitle", theme?.bold?.("Read") ?? "Read") ?? "Read";
  const pathText = theme?.fg?.("accent", path) ?? path;
  const suffix = theme?.fg?.("muted", range) ?? range;
  return `${title} ${pathText}${suffix}`;
}

function resultText(result: any, options: any, theme: any): string {
  const parts = Array.isArray(result?.content) ? result.content : [];
  const textParts = parts.filter((p: any) => p?.type === "text" && typeof p.text === "string");
  const images = parts.filter((p: any) => p?.type === "image");
  const message = textParts.map((p: any) => p.text).join("\n").trim();
  const failed = Boolean(result?.isError || options?.isError || /^ERROR:/m.test(message));
  const caption = /^Image file: (.+?) \(([^,]+), (.+)\)$/.exec(message);
  const rows: string[] = [];
  const title = failed ? "✗ Read failed" : "✓ Read image";
  rows.push(theme?.fg?.(failed ? "error" : "success", title) ?? title);
  if (images.length) {
    for (const image of images) {
      const mime = typeof image.mimeType === "string" ? image.mimeType : "unknown image type";
      rows.push(theme?.fg?.("muted", `▧ ${mime} image attached`) ?? `▧ ${mime} image attached`);
    }
  }
  if (caption && !failed) {
    rows.push(theme?.fg?.("accent", caption[1]!) ?? caption[1]!);
    rows.push(theme?.fg?.("muted", `${caption[2]} · ${caption[3]}`) ?? `${caption[2]} · ${caption[3]}`);
  } else if (message) rows.push(theme?.fg?.(failed ? "error" : "toolOutput", message) ?? message);
  else if (!images.length && !failed) rows.push(theme?.fg?.("muted", "No image content returned") ?? "No image content returned");
  // Read's successful payload is an image, not line-oriented text. Do not
  // truncate it or pretend offset/limit selects image lines; preserve messages.
  if (options?.expanded && result?.details !== undefined) rows.push(JSON.stringify(result.details, null, 2));
  return rows.join("\n");
}

export const readToolRenderer = {
  renderCall(args: any, theme: any) {
    return textComponent(formatReadCall(args, theme));
  },
  renderResult(result: any, options: any, theme: any) {
    return textComponent(resultText(result, options, theme));
  },
};

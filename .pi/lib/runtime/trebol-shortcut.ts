/** Compatibility seam: Pi gives keyboard shortcuts a context without reload.
 * Supply command-context reload only to our shortcut; never send user text.
 * No host files or unrelated shortcut handlers are modified.
 */
const installed = Symbol.for("pi-swarm-trebol-shortcut-adapter");
export const trebolShortcut = Symbol.for("pi-swarm-trebol-shortcut-handler");

export function installTrebolShortcut(Runner: any): void {
  const proto = Runner?.prototype;
  if (!proto || typeof proto.getShortcuts !== "function" || typeof proto.createCommandContext !== "function") {
    throw new Error("This Pi version cannot provide direct Trebol shortcut reload");
  }
  if (proto[installed]) return;
  const original = proto.getShortcuts;
  proto.getShortcuts = function (...args: any[]) {
    const shortcuts = original.apply(this, args);
    const shortcut = shortcuts.get("ctrl+n");
    if (shortcut?.handler?.[trebolShortcut]) {
      const handler = shortcut.handler;
      shortcuts.set("ctrl+n", { ...shortcut, handler: () => handler(this.createCommandContext()) });
    }
    return shortcuts;
  };
  Object.defineProperty(proto, installed, { value: true });
}

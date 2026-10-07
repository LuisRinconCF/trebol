/** Scoped compatibility adapter: shortcuts lack command-context reload.
 * One lease per extension owner; callers must retain/release it on shutdown.
 * Release is idempotent. Last release restores our host patch only.
 */
const installed = Symbol.for("pi-swarm-trebol-shortcut-adapter-v2");
export const trebolShortcut = Symbol.for("pi-swarm-trebol-shortcut-handler");

export function installTrebolShortcut(Runner: any): () => void {
  const proto = Runner?.prototype;
  if (!proto || typeof proto.getShortcuts !== "function" || typeof proto.createCommandContext !== "function") {
    throw new Error("This Pi version cannot provide direct Trebol shortcut reload");
  }
  let state = proto[installed];
  if (!state) {
    state = { original: proto.getShortcuts, patched: undefined as any, owners: new Set<object>() };
    state.patched = function (this: any, ...args: any[]) {
      const shortcuts = state.original.apply(this, args);
      if (!state.owners.size) return shortcuts;
      const shortcut = shortcuts.get("ctrl+n");
      if (shortcut?.handler?.[trebolShortcut]) {
        const handler = shortcut.handler;
        shortcuts.set("ctrl+n", { ...shortcut, handler: () => handler(this.createCommandContext()) });
      }
      return shortcuts;
    };
    proto.getShortcuts = state.patched;
    Object.defineProperty(proto, installed, { value: state, configurable: true });
  }
  const owner = {}; state.owners.add(owner);
  return () => {
    state.owners.delete(owner);
    if (!state.owners.size && proto.getShortcuts === state.patched) {
      proto.getShortcuts = state.original;
      delete proto[installed];
    }
  };
}

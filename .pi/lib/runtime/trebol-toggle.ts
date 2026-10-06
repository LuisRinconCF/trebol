export const TREBOL_MODE = Symbol.for("pi-swarm-trebol-mode");

type RuntimeMode = "on" | "off";

export function trebolMode(): RuntimeMode {
  return (globalThis as any)[TREBOL_MODE] === "off" ? "off" : "on";
}

export function setTrebolIdleProbe(probe: () => boolean | undefined): void {
  (globalThis as any)[Symbol.for("pi-swarm-trebol-idle-probe")] = probe;
}

export function trebolIdle(): boolean {
  const probe = (globalThis as any)[Symbol.for("pi-swarm-trebol-idle-probe")];
  return typeof probe !== "function" || probe() !== false;
}

export function setTrebolMode(mode: RuntimeMode): void {
  (globalThis as any)[TREBOL_MODE] = mode;
}

export function trebolFactory<T extends (...args: any[]) => any>(loadFactory: () => Promise<{ default: T }>): T {
  return (async (...args: Parameters<T>) => {
    if (trebolMode() === "off") return;
    const { default: factory } = await loadFactory();
    await factory(...args);
  }) as T;
}

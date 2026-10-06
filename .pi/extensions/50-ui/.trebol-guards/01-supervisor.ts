import { trebolFactory } from "../../../lib/runtime/trebol-toggle.ts";
export default trebolFactory(() => import("../supervisor.ts"));

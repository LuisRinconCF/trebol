import { registerSwarmGoal } from "../../.pi/lib/tools/swarm-goal.ts";

export default function swarmGoalExtension(pi: any): void {
  registerSwarmGoal(pi);
}

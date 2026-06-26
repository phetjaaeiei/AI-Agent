import { generatedImplementationSurface as dashboardSurfaceModule } from "../generated/implementation-surfaces/dashboard-surface.js";
import { generatedImplementationSurface as landingSurfaceModule } from "../generated/implementation-surfaces/landing-surface.js";
import { generatedImplementationSurface as workflowSurfaceModule } from "../generated/implementation-surfaces/workflow-surface.js";

export type ImplementationSurfaceModule = typeof workflowSurfaceModule;

export const implementationSurfaceModules: readonly ImplementationSurfaceModule[] = [
  landingSurfaceModule,
  dashboardSurfaceModule,
  workflowSurfaceModule
];

export function findImplementationSurfaceModule(
  modules: readonly ImplementationSurfaceModule[],
  targetPath: string | undefined
): ImplementationSurfaceModule | undefined {
  if (!targetPath) return undefined;
  return modules.find((module) => module.targetPath === targetPath);
}

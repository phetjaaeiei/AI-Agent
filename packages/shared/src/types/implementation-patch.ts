import type { RoleId } from "./roles.js";

export const IMPLEMENTATION_PATCH_POLICY_VERSION = "phase10-targeted-patch-v1";

export type ImplementationPatchSurfaceKind = "landing" | "dashboard" | "workflow";
export type ImplementationPatchTargetKind = "preview_manifest" | "surface_module";
export type ImplementationPatchFileType = "typescript";

export type ImplementationPatchAllowedTarget = {
  id: string;
  kind: ImplementationPatchTargetKind;
  path: string;
  fileType: ImplementationPatchFileType;
  ownerRoleId: RoleId;
  purpose: string;
  surfaceKind?: ImplementationPatchSurfaceKind;
  maxBytes: number;
};

export type ImplementationPatchPolicySnapshot = {
  schemaVersion: 1;
  policyVersion: typeof IMPLEMENTATION_PATCH_POLICY_VERSION;
  maxTargetsPerRun: number;
  allowedFileExtensions: readonly string[];
  deniedPathFragments: readonly string[];
  allowedTargets: readonly ImplementationPatchAllowedTarget[];
};

export type ImplementationPatchPolicyDecision = {
  allowed: boolean;
  reason: string;
  target?: ImplementationPatchAllowedTarget;
};

export type ImplementationPatchPolicyRequest = {
  targetPath: string;
  content: string;
};

const IMPLEMENTATION_PREVIEW_PATH = "apps/web/src/generated/mission-implementation-preview.ts";
const IMPLEMENTATION_SURFACE_ROOT = "apps/web/src/generated/implementation-surfaces";
const MAX_IMPLEMENTATION_PATCH_BYTES = 64_000;

export function createDefaultImplementationPatchPolicySnapshot(): ImplementationPatchPolicySnapshot {
  return {
    schemaVersion: 1,
    policyVersion: IMPLEMENTATION_PATCH_POLICY_VERSION,
    maxTargetsPerRun: 2,
    allowedFileExtensions: [".ts"],
    deniedPathFragments: [".env", ".git", ".data", "node_modules", "dist", "coverage", ".pem", ".key", ".p12", "id_rsa", "id_ed25519"],
    allowedTargets: [
      {
        id: "implementation-preview-manifest",
        kind: "preview_manifest",
        path: IMPLEMENTATION_PREVIEW_PATH,
        fileType: "typescript",
        ownerRoleId: "frontend_developer",
        purpose: "Typed manifest consumed by Mission Control's implementation preview.",
        maxBytes: MAX_IMPLEMENTATION_PATCH_BYTES
      },
      ...(["landing", "dashboard", "workflow"] as const).map((surfaceKind) => ({
        id: `implementation-${surfaceKind}-surface`,
        kind: "surface_module" as const,
        path: `${IMPLEMENTATION_SURFACE_ROOT}/${surfaceKind}-surface.ts`,
        fileType: "typescript" as const,
        ownerRoleId: "frontend_developer" as const,
        purpose: `Generated ${surfaceKind} implementation preview surface module.`,
        surfaceKind,
        maxBytes: MAX_IMPLEMENTATION_PATCH_BYTES
      }))
    ]
  };
}

export function implementationSurfaceTargetPath(surfaceKind: ImplementationPatchSurfaceKind): string {
  return `${IMPLEMENTATION_SURFACE_ROOT}/${surfaceKind}-surface.ts`;
}

export function evaluateImplementationPatchTarget(
  policy: ImplementationPatchPolicySnapshot,
  request: ImplementationPatchPolicyRequest
): ImplementationPatchPolicyDecision {
  const targetPath = normalizePatchPath(request.targetPath);
  const target = policy.allowedTargets.find((item) => item.path === targetPath);
  if (!target) {
    return { allowed: false, reason: `Target ${targetPath} is not in the implementation patch allowlist.` };
  }

  if (!policy.allowedFileExtensions.some((extension) => targetPath.endsWith(extension))) {
    return { allowed: false, reason: `Target ${targetPath} does not use an allowed implementation patch file extension.` };
  }

  if (policy.deniedPathFragments.some((fragment) => targetPath.includes(fragment))) {
    return { allowed: false, reason: `Target ${targetPath} matches a denied implementation patch path fragment.` };
  }

  if (new TextEncoder().encode(request.content).length > target.maxBytes) {
    return { allowed: false, reason: `Target ${targetPath} exceeds the implementation patch byte limit.`, target };
  }

  return { allowed: true, reason: `Target ${targetPath} is allowed by ${policy.policyVersion}.`, target };
}

function normalizePatchPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

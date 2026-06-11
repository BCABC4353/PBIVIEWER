export interface ErrorSurfaceContext {
  preLoad: boolean;
}

export interface ErrorPolicy {
  shouldSurface: (ctx: ErrorSurfaceContext) => boolean;
}

export const silentPostLoadErrorPolicy: ErrorPolicy = {
  shouldSurface: ({ preLoad }) => preLoad,
};

export const surfaceAllErrorPolicy: ErrorPolicy = {
  shouldSurface: () => true,
};

export function resolveErrorPolicy(
  surfacePostLoadErrors: boolean,
  explicit?: ErrorPolicy
): ErrorPolicy {
  if (explicit) return explicit;
  return surfacePostLoadErrors ? surfaceAllErrorPolicy : silentPostLoadErrorPolicy;
}

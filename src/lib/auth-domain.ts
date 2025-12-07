export type AccessCapability = `plan:${string}` | `feature:${string}`;

export const PLAN_ACCESS_CAPABILITIES = {
  pro: 'plan:pro' as AccessCapability,
  lifetime: 'plan:lifetime' as AccessCapability,
} as const;

export const buildFeatureAccessCapability = (key: string): AccessCapability =>
  `feature:${key}`;

export interface ExternalAccessProvider {
  hasAccess(userId: string, capability: AccessCapability): Promise<boolean>;
}

const nullExternalAccessProvider: ExternalAccessProvider = {
  async hasAccess() {
    return false;
  },
};

let externalAccessProvider: ExternalAccessProvider = nullExternalAccessProvider;

export const setExternalAccessProvider = (
  provider: ExternalAccessProvider
): void => {
  externalAccessProvider = provider ?? nullExternalAccessProvider;
};

export const getExternalAccessProvider = (): ExternalAccessProvider => {
  return externalAccessProvider;
};

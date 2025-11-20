import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from './auth';
import { getBaseUrl } from './urls/urls';

/**
 * https://www.better-auth.com/docs/installation#create-client-instance
 *
 * 为规避 Better Auth 客户端插件在类型级的细节不匹配，这里对
 * `createAuthClient` 的参数做一次宽松封装，同时保留返回类型。
 */
const createAuthClientUntyped = createAuthClient as (
  config: unknown
) => ReturnType<typeof createAuthClient>;

export const authClient = createAuthClientUntyped({
  baseURL: getBaseUrl(),
  plugins: [
    // https://www.better-auth.com/docs/plugins/admin#add-the-client-plugin
    adminClient(),
    // https://www.better-auth.com/docs/concepts/typescript#inferring-additional-fields-on-client
    inferAdditionalFields<typeof auth>(),
  ],
});

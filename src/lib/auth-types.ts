import type { auth } from './auth';

// https://www.better-auth.com/docs/concepts/typescript#additional-fields
export type Session = typeof auth.$Infer.Session;

type InferUser = typeof auth.$Infer.Session.user;

// 应用级 User 类型，补充 admin / billing 相关字段
export type User = InferUser & {
  role: string;
  banned: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
  customerId?: string | null;
};

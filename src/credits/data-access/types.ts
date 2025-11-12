import { getDb } from '@/db';

export type DrizzleDb = Awaited<ReturnType<typeof getDb>>;
type TransactionCallback = Parameters<DrizzleDb['transaction']>[0];
export type Transaction = Parameters<TransactionCallback>[0];

export type DbExecutor = DrizzleDb | Transaction;

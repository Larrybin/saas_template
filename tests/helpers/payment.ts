import { vi } from 'vitest';
import type { Logger } from 'pino';
import type {
  AddCreditsPayload,
  CreditsGateway,
} from '@/credits/services/credits-gateway';
import type { CreditsTransaction } from '@/credits/services/transaction-context';
import { resolveExecutor } from '@/credits/services/transaction-context';
import type {
  DbExecutor,
  PaymentInsert,
  PaymentRecord,
} from '@/payment/data-access/payment-repository';
import type {
  PaymentRepositoryLike,
  StripeCheckoutSessionLike,
} from '@/payment/services/stripe-deps';
import type { handleStripeWebhookEvent } from '@/payment/services/webhook-handler';
import type {
  NotificationGateway,
  PurchaseNotificationPayload,
} from '@/payment/services/gateways/notification-gateway';

type WebhookDeps = Parameters<typeof handleStripeWebhookEvent>[1];
type CreditsGatewayMock = CreditsGateway & {
  addCredits: ReturnType<typeof vi.fn>;
  addSubscriptionCredits: ReturnType<typeof vi.fn>;
  addLifetimeMonthlyCredits: ReturnType<typeof vi.fn>;
};
type NotificationGatewayMock = NotificationGateway & {
  notifyPurchase: ReturnType<typeof vi.fn>;
};
type LoggerMock = Logger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  fatal: ReturnType<typeof vi.fn>;
  trace: ReturnType<typeof vi.fn>;
  silent: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
};
export class InMemoryPaymentRepository implements PaymentRepositoryLike {
  private payments = new Map<string, PaymentRecord>();
  private sessions = new Map<string, PaymentRecord>();
  private subscriptions = new Map<string, PaymentRecord>();
  private activeTransaction: DbExecutor | null = null;

  async listByUser(userId: string, db?: DbExecutor): Promise<PaymentRecord[]> {
    this.ensureTransaction(db);
    return Array.from(this.payments.values())
      .filter((record) => record.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findOneBySubscriptionId(
    subscriptionId: string,
    db?: DbExecutor
  ): Promise<PaymentRecord | undefined> {
    this.ensureTransaction(db);
    return this.subscriptions.get(subscriptionId);
  }

  async findBySessionId(
    sessionId: string,
    db?: DbExecutor
  ): Promise<PaymentRecord | undefined> {
    this.ensureTransaction(db);
    return this.sessions.get(sessionId);
  }

  async insert(
    record: PaymentInsert,
    db?: DbExecutor
  ): Promise<string | undefined> {
    this.ensureTransaction(db);
    const normalized = this.normalizeRecord(record);
    this.payments.set(normalized.id, normalized);
    if (normalized.sessionId) {
      this.sessions.set(normalized.sessionId, normalized);
    }
    if (normalized.subscriptionId) {
      this.subscriptions.set(normalized.subscriptionId, normalized);
    }
    return normalized.id;
  }

  async upsertSubscription(
    record: PaymentInsert,
    db?: DbExecutor
  ): Promise<string | undefined> {
    this.ensureTransaction(db);
    if (!record.subscriptionId) {
      return undefined;
    }
    const normalized = this.normalizeRecord(record);
    this.subscriptions.set(record.subscriptionId, normalized);
    this.payments.set(normalized.id, normalized);
    return normalized.id;
  }

  async updateBySubscriptionId(
    subscriptionId: string,
    updates: Partial<PaymentInsert>,
    db?: DbExecutor
  ): Promise<string | undefined> {
    this.ensureTransaction(db);
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing) {
      return undefined;
    }
    const normalized = this.normalizeRecord({
      ...existing,
      ...updates,
    } as PaymentInsert);
    this.subscriptions.set(subscriptionId, normalized);
    this.payments.set(normalized.id, normalized);
    return normalized.id;
  }

  async withTransaction<T>(
    handler: (tx: DbExecutor) => Promise<T>
  ): Promise<T> {
    if (this.activeTransaction) {
      throw new Error('nested transactions are not supported');
    }
    const tx = Symbol('payment-tx') as unknown as DbExecutor;
    this.activeTransaction = tx;
    try {
      return await handler(tx);
    } finally {
      this.activeTransaction = null;
    }
  }

  getActiveTransaction(): DbExecutor | null {
    return this.activeTransaction;
  }

  private ensureTransaction(executor?: DbExecutor) {
    if (!this.activeTransaction) {
      return;
    }
    if (!executor || executor !== this.activeTransaction) {
      throw new Error('transaction handle missing or mismatched');
    }
  }

  private normalizeRecord(record: PaymentInsert): PaymentRecord {
    const now = new Date();
    return {
      id: this.ensureRequiredField(record, 'id'),
      priceId: this.ensureRequiredField(record, 'priceId'),
      type: this.ensureRequiredField(record, 'type'),
      interval: record.interval ?? null,
      userId: this.ensureRequiredField(record, 'userId'),
      customerId: this.ensureRequiredField(record, 'customerId'),
      subscriptionId: record.subscriptionId ?? null,
      sessionId: record.sessionId ?? null,
      status: this.ensureRequiredField(record, 'status'),
      periodStart: record.periodStart ?? null,
      periodEnd: record.periodEnd ?? null,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd ?? null,
      trialStart: record.trialStart ?? null,
      trialEnd: record.trialEnd ?? null,
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
    };
  }

  private ensureRequiredField<K extends keyof PaymentInsert>(
    record: PaymentInsert,
    field: K
  ): NonNullable<PaymentInsert[K]> {
    const value = record[field];
    if (value === undefined || value === null) {
      throw new Error(`payment ${String(field)} is required`);
    }
    return value as NonNullable<PaymentInsert[K]>;
  }
}

export function createCheckoutSessionLike(
  overrides: Partial<StripeCheckoutSessionLike> = {}
): StripeCheckoutSessionLike {
  return {
    id: overrides.id ?? 'sess_test',
    mode: overrides.mode ?? 'payment',
    customer: overrides.customer ?? 'cus_test',
    amount_total: overrides.amount_total ?? 0,
    metadata: overrides.metadata ?? {},
  };
}

export function createWebhookDeps(
  overrides: Partial<WebhookDeps> = {}
): WebhookDeps & {
  paymentRepository: InMemoryPaymentRepository;
  creditsGateway: CreditsGatewayMock;
  notificationGateway: NotificationGatewayMock;
  logger: LoggerMock;
} {
  const paymentRepository = new InMemoryPaymentRepository();
  const assertCreditsTransaction = (tx?: CreditsTransaction) => {
    const executor = resolveExecutor(tx);
    const active = paymentRepository.getActiveTransaction();
    if (!executor || !active || executor !== active) {
      throw new Error('credits transaction missing or mismatched executor');
    }
  };
  const withTransactionGuard = <Args extends unknown[]>(
    selector: (...args: Args) => CreditsTransaction | undefined
  ) =>
    vi.fn(async (...args: Args) => {
      const tx = selector(...args);
      assertCreditsTransaction(tx);
    });

  const creditsGateway = {
    addCredits: withTransactionGuard<
      Parameters<CreditsGateway['addCredits']>
    >((_, tx) => tx),
    addSubscriptionCredits: withTransactionGuard<
      Parameters<CreditsGateway['addSubscriptionCredits']>
    >((_, __, ___, tx) => tx),
    addLifetimeMonthlyCredits: withTransactionGuard<
      Parameters<CreditsGateway['addLifetimeMonthlyCredits']>
    >((_, __, ___, tx) => tx),
  } as CreditsGatewayMock;

  const notificationGateway = {
    notifyPurchase: vi.fn(
      async (_payload: PurchaseNotificationPayload) => {}
    ),
  } as NotificationGatewayMock;

  const billingService = {
    handleRenewal: vi.fn(async () => {}),
    grantLifetimePlan: vi.fn(async () => {}),
  };

  const logger = createLoggerMock();

  const deps: WebhookDeps & {
    paymentRepository: InMemoryPaymentRepository;
    creditsGateway: CreditsGatewayMock;
    notificationGateway: NotificationGatewayMock;
    logger: LoggerMock;
  } = {
    paymentRepository,
    creditsGateway,
    notificationGateway,
    billingService,
    logger,
  };
  Object.assign(deps, overrides);
  return deps;
}

function createLoggerMock(): LoggerMock {
  const logger = {
    level: 'info' as Logger['level'],
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(),
  } as LoggerMock & { _msgPrefix?: string };

  Object.defineProperty(logger, 'msgPrefix', {
    get() {
      return logger._msgPrefix;
    },
  });
  logger.child.mockImplementation(() => logger);
  return logger;
}

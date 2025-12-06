import { serverEnv } from '@/env/server';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes, type PaymentErrorCode } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

export type CreateCreemCheckoutParams = {
  productId: string;
  customerEmail: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  successUrl?: string;
  cancelUrl?: string;
};

export type CreateCreemCheckoutResult = {
  checkoutId: string;
  checkoutUrl: string;
};

export interface CreemClient {
  createCheckout(
    params: CreateCreemCheckoutParams
  ): Promise<CreateCreemCheckoutResult>;
}

const mapCreemCheckoutStatusToError = (
  status: number
): { code: PaymentErrorCode; retryable: boolean } => {
  if (status === 400 || status === 422) {
    return {
      code: ErrorCodes.CreemCheckoutInvalidRequest,
      retryable: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: ErrorCodes.CreemProviderMisconfigured,
      retryable: false,
    };
  }

  if (status >= 500) {
    return {
      code: ErrorCodes.CreemCheckoutDownstreamError,
      retryable: true,
    };
  }

  return {
    code: ErrorCodes.CreemCheckoutDownstreamError,
    retryable: false,
  };
};

export const createCreemClientFromEnv = (): CreemClient => {
  const logger = getLogger({
    span: 'payment.creem',
    provider: 'creem',
  });

  const apiKey = serverEnv.creemApiKey;
  const apiUrl = serverEnv.creemApiUrl;

  if (!apiKey || !apiUrl) {
    const missingEnv: string[] = [];
    if (!apiKey) {
      missingEnv.push('CREEM_API_KEY');
    }
    if (!apiUrl) {
      missingEnv.push('CREEM_API_URL');
    }

    logger.error(
      { missingEnv },
      'Creem payment provider is misconfigured: missing environment variables'
    );

    throw new DomainError<PaymentErrorCode>({
      code: ErrorCodes.CreemProviderMisconfigured,
      message: `Missing Creem configuration: ${missingEnv.join(', ')}`,
      retryable: false,
    });
  }
  return {
    async createCheckout(
      params: CreateCreemCheckoutParams
    ): Promise<CreateCreemCheckoutResult> {
      const endpoint = `${apiUrl.replace(/\/$/, '')}/checkouts`;

      const body = {
        product_id: params.productId,
        ...(params.requestId ? { request_id: params.requestId } : {}),
        customer: {
          email: params.customerEmail,
        },
        metadata: params.metadata ?? {},
        ...(params.successUrl ? { success_url: params.successUrl } : {}),
        ...(params.cancelUrl ? { cancel_url: params.cancelUrl } : {}),
      };

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          let errorBody: unknown;
          try {
            errorBody = await response.json();
          } catch {
            try {
              errorBody = await response.text();
            } catch {
              errorBody = undefined;
            }
          }

          logger.error(
            {
              status: response.status,
              endpoint,
              body,
              response: errorBody,
            },
            'Creem createCheckout request failed'
          );

          const status = response.status;
          const { code, retryable } = mapCreemCheckoutStatusToError(status);

          throw new DomainError<PaymentErrorCode>({
            code,
            message: `Creem createCheckout failed with status ${status}`,
            retryable,
          });
        }

        const data = (await response.json()) as {
          checkout_url: string;
          id?: string;
          checkout_id?: string;
        };

        return {
          checkoutUrl: data.checkout_url,
          checkoutId: data.checkout_id ?? data.id ?? '',
        };
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }

        logger.error(
          { error, endpoint, body },
          'Creem createCheckout network error'
        );

        throw new DomainError<PaymentErrorCode>({
          code: ErrorCodes.CreemCheckoutNetworkError,
          message: 'Network error while calling Creem checkout API',
          retryable: true,
        });
      }
    },
  };
};

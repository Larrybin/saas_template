# Subscription Transaction Hardening

## Goal
Ensure customer.subscription.* webhook handling updates payment records and grants credits atomically, mirroring the checkout credit purchase flow.

## Tasks
1. Wrap `onCreateSubscription`, `onUpdateSubscription`, and (if needed) `onDeleteSubscription` logic inside `paymentRepository.withTransaction`, passing the transaction to repository calls and CreditsGateway methods.
2. Ensure renewal detection and credit grants occur within the same transaction so failures roll back and propagate to Stripe.
3. Update tests in `src/payment/services/__tests__/stripe-payment-service.test.ts` to cover the transactional subscription flow and failure propagation.
4. Run `npx tsc --noEmit` and `pnpm test`.

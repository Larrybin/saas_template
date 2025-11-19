import type Stripe from "stripe";
import {
	type PaymentStatus,
	PaymentTypes,
	type PlanInterval,
	PlanIntervals,
} from "../../types";

export function mapStripeIntervalToPlanInterval(
	subscription: Stripe.Subscription,
): PlanInterval {
	const interval =
		subscription.items.data[0]?.price.recurring?.interval ?? "month";
	if (interval === "year") {
		return PlanIntervals.YEAR;
	}
	return PlanIntervals.MONTH;
}

export function mapSubscriptionStatusToPaymentStatus(
	status: Stripe.Subscription.Status,
): PaymentStatus {
	const statusMap: Record<string, PaymentStatus> = {
		active: "active",
		canceled: "canceled",
		incomplete: "incomplete",
		incomplete_expired: "incomplete_expired",
		past_due: "past_due",
		trialing: "trialing",
		unpaid: "unpaid",
		paused: "paused",
	};
	return statusMap[status] ?? "failed";
}

export function getSubscriptionPeriodBounds(subscription: Stripe.Subscription) {
	const items = subscription.items.data ?? [];
	if (!items.length) {
		return { periodStart: null, periodEnd: null };
	}
	let minStart: number | null = null;
	let maxEnd: number | null = null;
	for (const item of items) {
		const start = item.current_period_start;
		const end = item.current_period_end;
		if (minStart === null || start < minStart) {
			minStart = start;
		}
		if (maxEnd === null || end > maxEnd) {
			maxEnd = end;
		}
	}
	return {
		periodStart: minStart ? new Date(minStart * 1000) : null,
		periodEnd: maxEnd ? new Date(maxEnd * 1000) : null,
	};
}

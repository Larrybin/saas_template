import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { user } from "@/db/schema";

export class UserRepository {
	async findUserIdByCustomerId(
		customerId: string,
	): Promise<string | undefined> {
		const db = await getDb();
		const result = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.customerId, customerId))
			.limit(1);
		return result[0]?.id;
	}

	async linkCustomerIdToUser(
		customerId: string,
		email: string,
	): Promise<string | undefined> {
		const db = await getDb();
		const result = await db
			.update(user)
			.set({
				customerId,
				updatedAt: new Date(),
			})
			.where(eq(user.email, email))
			.returning({ id: user.id });
		return result[0]?.id;
	}
}

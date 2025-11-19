export type CreditCommand = {
	userId: string;
	type: string;
	amount: number;
	description: string;
	expireDays?: number;
	paymentId?: string;
	periodKey?: number;
};

export type CreditCommandError = {
	userId: string;
	type: string;
	error: unknown;
};

export type CommandExecutionResult = {
	total: number;
	processed: number;
	skipped: number;
	errors: CreditCommandError[];
	flagEnabled: boolean;
};

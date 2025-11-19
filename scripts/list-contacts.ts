import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
	throw new Error("RESEND_API_KEY is not set");
}

const audienceId = process.env.RESEND_AUDIENCE_ID;

if (!audienceId) {
	throw new Error("RESEND_AUDIENCE_ID is not set");
}

const resend = new Resend(resendApiKey);

export default async function listContacts() {
	const contacts = await resend.contacts.list({
		audienceId,
	});

	// print all emails
	const emails: string[] = [];
	if (Array.isArray(contacts.data?.data)) {
		for (const contact of contacts.data.data) {
			emails.push(contact.email);
		}
	} else {
		console.error("contacts is not iterable");
	}

	console.log(emails.join(", "));
}

listContacts();

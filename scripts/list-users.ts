import dotenv from 'dotenv';
import { getDb } from '../src/db/index.js';
import { user } from '../src/db/schema.js';
dotenv.config();

export default async function listUsers() {
  const db = await getDb();

  try {
    const users = await db.select({ email: user.email }).from(user);

    // Extract emails from users
    const emails: string[] = users.map((user) => user.email);

    console.log(`Total users: ${emails.length}`);

    // Output all emails joined with comma
    console.log(emails.join(', '));
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

listUsers();

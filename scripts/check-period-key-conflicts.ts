import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL is not set. Please export it before running the check.'
  );
  process.exit(1);
}

const sqlFile = path.resolve('scripts/sql/check_period_key_conflicts.sql');
const sqlText = readFileSync(sqlFile, 'utf8');

const statements = sqlText
  .split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

async function main() {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    for (const statement of statements) {
      const result = await client.unsafe(statement);
      console.log(`\nQuery:\n${statement}\nResult:`);
      console.table(result);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to run period key conflict check:', error);
  process.exit(1);
});

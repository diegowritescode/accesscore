const path = require('node:path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

module.exports = async () => {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';
  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, '..', '..', 'drizzle') });
  } finally {
    await pool.end();
  }
};

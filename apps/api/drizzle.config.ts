import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/db/schema.ts',
    './src/identity/infrastructure/persistence/schema.ts',
    './src/authn/infrastructure/persistence/schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore',
  },
});

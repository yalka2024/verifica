import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma generate does not connect. This placeholder keeps dependency installs
    // deterministic; runtime and migration commands require a real DATABASE_URL.
    url: process.env["DATABASE_URL"] || "postgresql://build:build@localhost:5432/build",
  },
});


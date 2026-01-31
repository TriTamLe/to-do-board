# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TanStack Start full-stack React application (TypeScript) using file-based routing, with dual database backends (Prisma/PostgreSQL and Convex). Uses pnpm as the package manager.

## Commands

```bash
pnpm dev              # Start dev server on port 3000
pnpm build            # Production build (Vite)
pnpm test             # Run tests (Vitest)
pnpm lint             # Lint with Biome
pnpm format           # Format with Biome
pnpm check            # Biome check (lint + format)
pnpm typecheck        # TypeScript type checking (tsc --noEmit)

# Database (all use .env.local for env vars)
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database
pnpm db:migrate       # Run Prisma migrations
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed the database
```

## Architecture

- **Framework**: TanStack Start with TanStack Router (file-based routing)
- **Routing**: Routes auto-generated from `src/routes/` into `src/routeTree.gen.ts` (do not edit)
- **Root layout**: `src/routes/__root.tsx` — app shell with Header, devtools, and providers
- **Path alias**: `@/*` maps to `./src/*`
- **Integrations**: Convex provider in `src/integrations/convex/`, TanStack Query in `src/integrations/tanstack-query/`
- **Database**: Prisma client singleton in `src/db.ts`, schema in `prisma/schema.prisma` (PostgreSQL)
- **Convex**: Schema and mutations/queries in `convex/` directory
- **Generated files**: `src/routeTree.gen.ts` and `src/generated/` are auto-generated — do not edit

## Code Style (Biome)

- Tab indentation, double quotes
- Import organization enabled
- Excludes: `src/routeTree.gen.ts`, `src/styles.css`

## Convex Guidelines

- Every Convex document has auto-generated `_id` and `_creationTime` system fields — do not redefine them
- Use `v` validators from `convex/values` for schema definitions (e.g., `v.string()`, `v.id("tableName")`, `v.optional()`, `v.union()`)
- Indexes are auto-added for system fields; define custom indexes with `.index()`

## UI

- Tailwind CSS 4 with CSS variables for theming (light/dark)
- shadcn/ui components: install via `pnpm dlx shadcn@latest add <component>`
- Icons: Lucide React

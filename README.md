![AdonisJS 7](https://img.shields.io/badge/AdonisJS_7-5A45FF?style=for-the-badge&logo=adonisjs&logoColor=white) ![React 19](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) ![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![Inertia.js](https://img.shields.io/badge/Inertia.js-9552EA?style=for-the-badge&logo=inertia&logoColor=white)

![Node >=22.8](https://img.shields.io/badge/Node-%3E%3D22.8-339933?style=for-the-badge&logo=node.js&logoColor=white) ![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white) ![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)

# Drip Nepal 🇳🇵

**Modern Multi-Vendor Ecommerce Platform for Nepal**

Drip Nepal is a full-stack marketplace that lets customers discover products from local shops while giving vendors powerful tools to manage their stores, products, orders, and analytics — all built with modern TypeScript from front to back.

---

## Features

| 🛒 Customer                    | 🏪 Shop (Vendor)                 | ⚙️ Admin                       |
| ------------------------------ | -------------------------------- | ------------------------------ |
| • Session-based authentication | • Shop registration & onboarding | • User management              |
| • Product browsing & search    | • Product CRUD & media uploads   | • Shop approval & moderation   |
| • Category & filter navigation | • Order management dashboard     | • Product moderation           |
| • Shopping cart                | • Inventory & variant tracking   | • Platform-wide analytics      |
| • Checkout flow                | • Sales analytics                | • Role & permission management |
| • Order history                | • Staff role management          | • —                            |
| • Saved addresses              | • —                              | • —                            |
| • Wishlist _(planned)_         | • —                              | • —                            |

---

## Screenshots

> 📸 Screenshots coming soon.
>
> See the [`/screenshots`](./screenshots) directory for future assets.

---

## Architecture

Drip Nepal follows a **monolithic (but modular)** architecture powered by Inertia.js, which keeps the frontend and backend in a single codebase without sacrificing the developer experience of a modern SPA.

```
          ┌─────────────────────────┐
          │       Browser           │
          │  (React + Inertia.js)   │
          └───────────┬─────────────┘
                      │  HTTP (same-origin)
                      │  Inertia requests
                      ▼
          ┌─────────────────────────┐
          │    AdonisJS 7 Server    │  ◀── SSR on first load
          │                         │
          │  ┌───────────────────┐  │
          │  │   Routes / Ctrl   │  │
          │  │   Lucid ORM       │  │
          │  │   Session Auth    │  │
          │  │   Tuyau API       │  │
          │  └───────────────────┘  │
          └───────────┬─────────────┘
                      │
          ┌───────────┴─────────────┐
          │        PostgreSQL       │
          │        + Redis          │
          │        + Mailpit        │
          └─────────────────────────┘
```

| Layer               | Technology                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------- |
| **Frontend**        | React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, TanStack Table / Virtual |
| **Backend**         | AdonisJS 7, TypeScript, Lucid ORM, VineJS validation                                      |
| **Auth**            | Session-based (cookie driver)                                                             |
| **Database**        | PostgreSQL (primary), SQLite (testing)                                                    |
| **Cache / Session** | Redis                                                                                     |
| **Infrastructure**  | Docker Compose (PostgreSQL + Redis + Mailpit)                                             |

---

## Project Structure

```
drip-nepal/
├── app/                      # Backend (AdonisJS)
│   ├── controllers/          # Route handlers
│   ├── middleware/           # Auth, guest, inertia, silent auth
│   ├── models/               # Lucid ORM models (18 models)
│   ├── validators/           # VineJS validation schemas
│   ├── transformers/         # Response transformers
│   ├── constants/            # Enums and constants
│   └── exceptions/           # Error handler
├── inertia/                  # Frontend (React + Inertia)
│   ├── components/           # Reusable UI and commerce components
│   ├── pages/                # Page components (route-driven)
│   ├── layouts/              # Layout wrappers
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilities, mock data
│   ├── css/                  # Tailwind entry and global styles
│   └── assets/               # Images, fonts
├── config/                   # AdonisJS configuration (13 files)
├── database/
│   ├── migrations/           # 23 database migrations
│   ├── seeders/              # 5 seeders (roles, categories, shops, etc.)
│   └── factories/            # Model factories for testing
├── start/                    # Routes, kernel, env schema
├── providers/                # Custom service providers
├── resources/views/          # Edge templates (root layout)
├── tests/                    # Japa test suites
├── screenshots/              # 📸 Future screenshots
├── docker-compose.yml        # PostgreSQL + Redis + Mailpit
├── adonisrc.ts               # AdonisJS configuration
├── vite.config.ts            # Vite build configuration
├── tsconfig.json             # TypeScript config
├── eslint.config.js          # ESLint flat config
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 22.8
- **pnpm** (recommended) or npm
- **PostgreSQL** 16+ (or use Docker Compose below)
- **Redis** (optional, for session store)

### Quick Start with Docker Compose

The easiest way to spin up the required infrastructure:

```bash
docker compose up -d
```

This starts **PostgreSQL 18**, **Redis 8**, and **Mailpit** (SMTP testing UI at `http://localhost:8025`).

### Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/drip-nepal.git
cd drip-nepal

# 2. Install dependencies
pnpm install

# 3. Copy environment file and generate app key
cp .env.example .env
node ace generate:key

# 4. Configure your .env file
#     Edit .env with your database credentials

# 5. Run database migrations
node ace migration:run

# 6. Seed the database (optional, but recommended)
node ace db:seed

# 7. Start the development server
pnpm dev
```

Open **http://localhost:3333** in your browser.

> **Note:** If you're using Docker Compose, the default `.env` values match the compose file. Just update `DB_HOST` to `localhost` and you're good to go.

---

## Environment Variables

| Variable         | Description                | Default                                              |
| ---------------- | -------------------------- | ---------------------------------------------------- |
| `APP_KEY`        | Application encryption key | **Required** — generate with `node ace generate:key` |
| `PORT`           | HTTP server port           | `3333`                                               |
| `HOST`           | Server host                | `localhost`                                          |
| `NODE_ENV`       | Environment mode           | `development`                                        |
| `LOG_LEVEL`      | Logging level              | `info`                                               |
| `APP_URL`        | Public application URL     | `http://localhost:3333`                              |
| `SESSION_DRIVER` | Session storage driver     | `cookie`                                             |
| `DB_HOST`        | PostgreSQL host            | `localhost`                                          |
| `DB_PORT`        | PostgreSQL port            | `5432`                                               |
| `DB_USER`        | Database user              | `dripnepal`                                          |
| `DB_PASSWORD`    | Database password          | `secret`                                             |
| `DB_DATABASE`    | Database name              | `dripnepal`                                          |
| `VITE_APP_NAME`  | Application display name   | `Drip Nepal`                                         |

---

## Development Scripts

| Script           | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Start development server with HMR    |
| `pnpm build`     | Build for production                 |
| `pnpm start`     | Start production server              |
| `pnpm test`      | Run test suite (Japa)                |
| `pnpm lint`      | Lint all files with ESLint           |
| `pnpm format`    | Format code with Prettier            |
| `pnpm typecheck` | Type-check both backend and frontend |

---

## Database

Migrations are managed via **Lucid ORM** (AdonisJS's built-in query builder and ORM).

```bash
# Run all pending migrations
node ace migration:run

# Rollback last batch
node ace migration:rollback

# Run seeders
node ace db:seed
```

### Migrations

The project includes **23 migrations** covering four domain areas:

1. **Identity & Authorization** — users, global roles, permissions, role-permission assignments
2. **Vendor / Shop System** — shops, shop roles, staff assignments
3. **Product Catalog** — categories, products, variants, attributes, media
4. **Commerce System** — addresses, carts, cart items, orders, order items, payments

### Seeders

There are **5 seeders** for development and testing:

- `global_role_seeder` — admin, customer, vendor roles
- `permission_seeder` — granular permissions
- `category_seeder` — product categories
- `shop_seeder` — sample shops
- `customer_seeder` — test customer accounts

> 📖 Detailed database documentation is available at [`database/README.md`](./database/README.md).

---

## Roadmap

- [x] Customer authentication (signup, login, logout)
- [x] Product browsing & category navigation
- [x] Shopping cart
- [x] Checkout flow
- [ ] Vendor onboarding & shop registration
- [ ] Order management dashboard
- [ ] Inventory management
- [ ] Vendor analytics dashboard
- [ ] Admin panel (user, shop, product moderation)
- [ ] Payment gateway integration
- [ ] Wishlist
- [ ] Mobile application

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** — `git checkout -b feat/my-feature`
3. **Make your changes** — write code, add tests, update docs
4. **Run the tests** — `pnpm test` and `pnpm lint`
5. **Submit a pull request** — describe what you changed and why

Please make sure your code passes the linting and type-checking steps before opening a PR.

---

## Code Style

This project enforces consistent code quality through automation:

- **TypeScript** — strict mode with full type safety
- **ESLint** — flat config (`eslint.config.js`) with `@adonisjs/eslint-config`
- **Prettier** — automatic formatting with `@adonisjs/prettier-config`
- **Import aliases** — clean imports via `#models/*`, `#controllers/*`, `~/components/*`, etc.

---

## License

This project is open source under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---

## Author

**Haru Blank**

- Website: _Coming soon_
- Twitter / X: _Coming soon_
- GitHub: [@your-username](https://github.com/your-username)

---

Built with ❤️ for Nepal's local businesses.

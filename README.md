# Ahiora

Bilingual (English/Spanish) project finances and bill management for a business, designed to run on a Raspberry Pi on a local network. Uses React/Vite and a Node HTTP server with SQLite; no separate database service is required.

## Run locally

Use **Node.js 22.13 or newer** (a supported LTS release is recommended on the Pi).

```sh
npm ci
npm run db:reset
npm run dev
```

The client is at `http://127.0.0.1:5173`; the API is at `http://127.0.0.1:3001`.

`db:reset` **deletes the configured local database and local receipt uploads** and generates a fresh domain schema and demo data. Stop the server before resetting. It only accepts database paths under this repository's `data/` directory. Normal startup applies numbered schema migrations without deleting data and creates an empty database if needed. Legacy databases require the explicit reset command; no legacy tables are carried forward.

Demo accounts (all use `DemoPass123!`):

| Role     | Email               | Access                                                   |
| -------- | ------------------- | -------------------------------------------------------- |
| Owner    | owner@demo.local    | Business, finances, projects, all team members           |
| Admin    | admin@demo.local    | Finances, projects, employees, contractor contacts       |
| Employee | employee@demo.local | Assigned projects, their finances and receipts, comments |

Contractors have **no login accounts**. Their name, email/phone/address, and many-to-many project assignments are managed separately. Every employee reports to the business owner.

Demo records include three projects, a contractor assigned to two projects, all three transaction types, a text receipt, monthly/weekly/interval bills, a processed payment, and a processing payment. The café project starts with a $10,000 budget, $2,000 expense, $1,000 income, and $250 refund: **$9,250 available**.

For a fresh non-demo installation, omit `npm run db:reset` and create a business through the signup screen. Each business has one owner and one currency; each login belongs to one business. Team accounts are created by an owner/admin with an initial password shared separately; there is no email invitation service.

## Domain rules

- Transactions replace the old income, expense, provider-payable, payroll, client-charge, and debt modules. Record financial activity as expense/income/refund transactions or bill schedules (for example, payroll as a recurring bill).
- Manual transactions belong to exactly one project or property. Properties have a name, address, optional tenant, and optional monthly rent; rent is informational and creates no automatic transactions. Bills are standalone business obligations.
- Money is stored as **integer cents**. Project balance is budget + income + refunds − expenses; budgets default to zero and can be edited. Property balance is income + refunds − expenses. Income and refunds are shown separately and combined. These figures are not bank balances.
- A shared report selector defaults to calendar YTD and supports this month, trailing three months, trailing twelve months, and lifetime. Periods end on the business's current date. Project budgets are applied once; lifetime balances are also displayed on detail pages. Calendar browsing does not change this selector.
- Property income requires only an amount and date after selecting the property and income type. The name defaults to Rent income; references and attachments are optional. Refunds, expenses, project income, and bill payments require a **receipt/reference ID**. Reference dates use date-only values; attachments and notes are optional. Existing reference timestamps remain stored and display as dates in the business time zone.
- References target a transaction, a specific bill occurrence, or both when they describe the same payment. A file belongs to a reference and inherits its transaction or bill access. Previews and downloads are authenticated. Evidence is append-only through the API.
- A **Bill** is a schedule; a **Bill occurrence** is a specific due date and amount. Recurrence supports one-time, monthly, weekly, yearly, and every N days.
- A bill schedule can have one optional PNG, JPEG, or WebP image (up to 8 MB). Its image is shared across recurring payments and is accessible only to owners/admins in its business. Bill images are separate from required payment evidence.
- Dates stay anchored to the scheduled due date, regardless of when payment is made. Monthly dates clamp to the last day of shorter months; a 31st schedule returns to the 31st in longer months. Calendar dates use date-only arithmetic to avoid daylight-saving shifts.
- One full payment record is supported per occurrence. It requires evidence and a payment account. Processing payments create no expense; marking processed atomically creates exactly one standalone bill expense, shares the occurrence's evidence, and marks it paid. Bill expenses do not affect property/project balances. Failed payments retain evidence and can be marked processing again. Repeated submissions cannot create another expense.
- Manual transactions can be voided and replaced, retaining evidence and audit history. Processed payment expenses cannot be voided independently. Financial activity in archived projects is read-only until the project is restored.
- To change a bill schedule, pause it and create a replacement. Pausing cancels future unpaid occurrences while preserving current/overdue obligations, processing payments, and paid history.
- Comments target exactly one project or transaction. Authors may edit their comments; the edited timestamp is retained. Transaction comments also appear in the project discussion.
- Admin last access is updated on authenticated business access. Owners can see admin access timestamps; other admins only see their own.
- Language preference is saved per user. Interface, dates, currency formatting, statuses, and validation messages are localized. User-written names and comments are preserved.

The calendar shows persisted bill due dates, payments with their processing status, and manual transactions. A payment and its due date are separate calendar events; its expense transaction is not duplicated as another calendar event. Upcoming/overdue reminders are shown **inside the app**; email/SMS delivery and bank/payment processing are not implemented.

## Tests and maintenance

### Mobile navigation

At phone widths up to 640px, the signed-in interface follows the [mobile Figma design](https://www.figma.com/design/pVgPm23yFSMiS0voPt0imo/Untitled). The fixed company/user header and floating Home / Add / Menu controls stay above the blurred content when an overlay is open. Home opens Dashboard; Menu displays navigation links directly over the blurred content. Escape, tapping the backdrop, or choosing a destination dismisses the overlay.

Add offers New Transaction and Bill Payment to owners/admins. Mobile transaction entry uses project/name/type, financial details, and required evidence steps. Bill Payment offers a new schedule or a scrollable picker containing every missed payment plus the nearest upcoming unpaid payment per schedule. Later future installments stay out of the picker; the full calendar and bill history remain available. Failed payment attempts resume their existing bill record instead of creating a second payment. Employees keep read/comment access and cannot use financial quick actions.

All mobile transaction, schedule, and payment entry points share the same styled flows. Back retains entered values and attachments. The close button returns to the underlying page and confirms before discarding an unsaved draft; background navigation is inactive while a form is open. Creating a schedule records no payment or expense and then offers Record first payment or Done for now. The first obligation is available immediately, even when its due date is outside the calendar's current generation horizon. Bottom navigation sits 8px above the device's bottom safe area.

On mobile, personal language switching lives in Settings, including a personal-only Settings view for employees. Business settings and payment accounts keep their existing role restrictions. The desktop shell follows the Figma header/sidebar and card design throughout the signed-in pages. Bills and reminders live under Transactions, Team is hidden, and language preferences live in Settings on all screen sizes. Transaction cards open full details, references, comments, and file previews. The layout uses `src/mobile.css` and `src/mobile-finance.css`; Figma artwork/icons and the licensed Koulen, Metrophobic, Inter, and Gabarito fonts are stored locally in `src/assets/`.

```sh
npm test
npm run build
```

Tests use isolated in-memory databases and temporary upload directories. They never reset the working database. `seedDemo(db, { today, uploadDir })` in `server/demo.js` supports fixed test dates. Tests cover references, balances, payment transitions and retries, role/business boundaries, attachments, comments, recurrence edge cases, calendar history, and language parity.

```sh
npm run format
npm run format:check
```

Schema changes go in numbered SQL files under `server/migrations/` and are registered in `server/db.js`. Business behavior lives in `server/domain.js`; HTTP/auth/static serving is in `server/app.js`. `shared/` contains date and calendar rules used in tests and the client. See [the domain model](docs/domain-model.md).

## Raspberry Pi / local network

Use a 64-bit Raspberry Pi OS and a compatible Node runtime. Build once and serve the client and API from one process:

```sh
npm ci
npm run build
HOST=0.0.0.0 npm start
```

Visit `http://<pi-local-address>:3001` from another machine on the same network. For production, run this command as a system service with the repository as its working directory. Vite's development server is not needed for hosting.

Configuration can be saved in `.env` using `.env.example`. SQLite defaults to `data/finance.sqlite`; receipts default to `data/uploads/`. Keep the data directory writable by the service user. SQLite uses foreign keys, WAL journaling, and a busy timeout. Back up the database with SQLite's backup facility and back up uploads together; do not copy only the main SQLite file while WAL writes are active.

Use real accounts instead of demo credentials for business data. If serving through HTTPS, set `COOKIE_SECURE=1`. Optional GitHub OAuth remains available when configured, with browser-bound state and verified email. It requires network access; email/password authentication works entirely locally.

### Property and bill migration

Migration 003 adds properties and moves bills out of projects. Existing schedules, occurrences, payments, files, and references keep their IDs. Expenses generated by old bill payments move from their project to their originating bill, so project totals no longer include them. New property and standalone bill access is restricted to owners/admins; employees retain their existing assigned-project access. Startup applies this migration automatically without resetting data.

Migration 004 allows property income without a primary reference; other transactions retain the database requirement. Existing transactions, references, and attachments keep their IDs and contents. Optional references can be added to rent income later.

# Small Business Financial Dashboard

Local-first financial dashboard for tracking income, expenses, providers, employees, client charges, and debts.

The app uses:

- React, Vite, and React Router for the frontend
- A local Node HTTP API for authentication and data access
- SQLite for the database, stored by default at `data/finance.sqlite`
- HTTP-only session cookies
- `scrypt` password hashing from Node's built-in crypto module
- Optional GitHub OAuth account sign-in
- Receipt/file attachments stored on disk with metadata in SQLite
- English and Spanish UI labels

## Setup

1. Install dependencies:

```bash
npm install
```

2. Optional: create `.env` from `.env.example`.

```bash
cp .env.example .env
```

3. Run the local app:

```bash
npm run dev
```

The frontend runs at `http://127.0.0.1:5173` and the API runs at `http://127.0.0.1:3001`.

## Authentication

Email/password auth works locally without any cloud service. When a user signs up, the server creates a SQLite user record, hashes the password, starts an HTTP-only cookie session, and seeds starter financial records for the account.

GitHub OAuth is optional. To enable it, create a GitHub OAuth app and add these values to `.env`:

```bash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_CALLBACK_URL=http://127.0.0.1:3001/api/auth/github/callback
```

## Database

The SQLite schema is created automatically by `server/db.js` on startup. The main tables are:

- `users`
- `sessions`
- `oauth_accounts`
- `incomes`
- `expenses`
- `providers`
- `employees`
- `client_charges`
- `debts`
- `bills`
- `attachments`

Each finance table stores `user_id`, so records are scoped to the signed-in account.

Uploaded receipts and files are stored in `data/uploads/`. SQLite stores the file name, size, MIME type, owning user, related record, and local storage path. The default upload limit is 8 MB per file and can be changed with `MAX_UPLOAD_BYTES`.

Transactions include an optional reference or confirmation number.

Bills and reminders are recurring templates. They can track the payee, bill type, amount, next due date, recurrence rule, payment method, payment link, phone number, notes, status, and any setup documents.

When a bill is paid, use `Record payment` and enter only the payment amount, payment date, optional confirmation number, and optional receipt/screenshot/file. The payment is stored in `bill_payments`, and receipts are attached directly to that payment record.

Monthly reminders support day-of-month scheduling. If a bill is configured for the 31st, the app automatically clamps the next due date to the final day of shorter months, including February 28 or February 29 in leap years. Interval reminders support rules like every 30 days.

Monthly profit is calculated as collected income in the current month minus paid expenses in the current month.

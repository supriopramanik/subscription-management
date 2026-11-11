# Subtrack · Complaiance BD Ltd.

A company subscription workspace built with **React + Vite** in `client/` and **Express + Mongoose** in `server/`. MongoDB stores application records; Cloudinary stores logos and authenticated document attachments. The original [Wapy project](https://github.com/meceware/wapy.dev) informed the subscription-management concept. This is a new implementation; no Wapy source or assets are included.

## Git remotes and pushing

The local checkout uses the company repository as the primary fetch remote. `origin` has two push URLs, so a normal `git push` sends the current branch to both repositories:

- Primary: https://github.com/Compliance-BD-LTD/subscription-management
- Secondary: https://github.com/supriopramanik/subscription-management

The separate `secondary` remote is available for explicit fetch/pull operations. Git remote configuration is local to each checkout; after a fresh clone, configure both push destinations once:

```sh
git config --replace-all remote.origin.pushurl https://github.com/Compliance-BD-LTD/subscription-management.git
git config --add remote.origin.pushurl https://github.com/supriopramanik/subscription-management.git
git config remote.pushDefault origin
git config push.default simple
git config push.autoSetupRemote true
```

Commit changes, then run `git push` (or your editor's Push action). Review the output for both destinations: Git pushes to each repository separately, so one can succeed while the other fails. Resolve any access or history conflict and retry without force-pushing. The root `.env`, dependencies and generated builds are excluded from Git.

## Start locally

Requirements: Node.js **24 LTS**, npm, a MongoDB replica set (Atlas works), and your Cloudinary account.

```sh
npm ci
# Keep your existing root .env; use .env.example only as a reference.
npm run dev
```

- App: **http://localhost:5173**
- Design / interactive sample workspace: **http://localhost:5173/?demo=1**
- API health: **http://localhost:4000/api/health**

Visit the app and create the first administrator account. Setup closes permanently once the company workspace exists. Use **Team members → Add employee** to create other accounts. Give each employee their login URL, email and temporary password privately. They must replace that password before reading company data. No credentials or real records are seeded automatically.

Demo mode uses sample data held in browser memory. Refreshing resets the demo; it does not write to MongoDB or Cloudinary. Its illustrative USD exchange rate is explicitly marked. Your real workspace begins empty, with BDT reporting and automatically synchronized online reference rates.

The provided `.env` is ignored by Git and Docker. It is loaded only by the server. The implementation supports your existing `MONGODB_URI`, `CLOUDINARY_FOLDER`, and `CLOUDINARY_BACKUP_URL`; the latter must be a Cloudinary API URL in `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` format. Alternatively set `CLOUDINARY_URL` or the three separate Cloudinary credentials in `.env.example`.

Check service configuration without writing records or exposing secrets:

```sh
node server/scripts/check-services.js
```

Optional Cloudinary upload/delivery diagnostic (creates two tiny synthetic assets, verifies private downloads and removes both):

```sh
node server/scripts/check-upload.js
```

If MongoDB cannot connect, check the Atlas database user's access, **Atlas → Network Access** for your current machine/server IP, cluster status and DNS. Do not add a broad allow-all network rule just to make local development work. Uploads require valid Cloudinary API credentials and network access.

## Local MongoDB alternative

Payment recording and first-run provisioning use transactions. MongoDB must run as a replica set or sharded cluster; standalone MongoDB is rejected on startup. Atlas already supports transactions.

For an isolated local database (requires Docker):

```sh
docker compose -f compose.mongo.yaml up -d
```

For a host-run Node server, set a development `.env` to:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/complaiance_subscriptions?replicaSet=rs0&directConnection=true
APP_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
```

This optional Mongo compose is intended for host-run development. The production application compose uses the external `MONGODB_URI` from your environment; it does not start or replace your database. Local data persists in a Docker named volume.

## Roles

This application has **one shared company workspace per deployment**, not separate tenants.

| Capability                                                | Administrator | Manager | Member           | Viewer |
| --------------------------------------------------------- | ------------- | ------- | ---------------- | ------ |
| View dashboards, all subscriptions, payments and activity | Yes           | Yes     | Yes              | Yes    |
| Download company attachments                              | Yes           | Yes     | Yes              | Yes    |
| Add subscriptions                                         | Yes           | Yes     | Assigned to self | No     |
| Edit subscriptions, record payments, upload/remove files  | All           | All     | Assigned to self | No     |
| Delete subscriptions without payment history              | Yes           | Yes     | No               | No     |
| Manage employees and reset temporary passwords            | Yes           | No      | No               | No     |
| Company settings, categories, departments, budget, rates  | Yes           | No      | No               | No     |

Permissions are enforced in the API. Members cannot reassign their subscriptions to other users. All employees can view company spending and attachments by design. Deactivate employees to revoke access; reassign their active/trial subscriptions first. Role changes, deactivation and password resets invalidate their sessions. The last active administrator is protected. Changing your own role requires signing in again.

## Subscription and payment behavior

- Store price in the **original purchase currency**: BDT, USD, EUR, GBP, INR, AED, SGD, CAD or AUD. Each subscription retains its own currency.
- Reporting defaults to **BDT**. The server automatically fetches reference rates from [ExchangeRate-API](https://www.exchangerate-api.com/docs/free), with no API key or extra environment variables. It checks on startup and hourly thereafter, including when nobody has the app open. The free provider publishes new rates **once per day**; this is automatic daily reference data, not a second-by-second market feed. Provider attribution is shown in the app.
- Settings shows read-only rates, their provider timestamp, last check and next scheduled check. **Check latest** uses the same shared hourly cooldown to avoid rate limiting. A reporting currency change recalculates from the same source snapshot; it does not need another provider request.
- A validated rate snapshot persists in the `subtrack_exchange_rates` collection. Concurrent requests and multiple server instances share an atomic refresh lease. Network/provider failures keep the last successful rates and retry in five minutes; saved data survives restarts. Missing first-sync rates and cached/out-of-date data are clearly flagged. Rates more than 36 hours old are marked stale. The API ignores client-supplied currency rates, so saving an older Settings form cannot overwrite a newer snapshot.
- Supported purchase currencies keep their original amounts. If the first automatic fetch fails, foreign currencies are excluded from converted totals until a successful fetch; no guessed or zero rates are substituted. Exchange rates are estimates for reporting; actual bank/card charges may differ.
- Monthly commitment normalizes weekly × 52 ÷ 12, quarterly ÷ 3, yearly ÷ 12 and monthly amounts; one-time costs are excluded. Active and trial plans count toward commitment. A trial uses the amount you enter, so enter 0 for a genuinely free trial.
- “Paid this month” uses actual recorded payments in the company timezone. Conversion uses the latest available reference snapshot, not historical exchange rates or accounting valuations.
- Forecasts project scheduled due dates from today using current plans, prices and automatically synchronized reference rates. Historical overdue bills are shown in the renewal watch list; they are not moved into a future forecast month. Auto-renew off means no future cycles are projected.
- **Mark paid records an external payment**; it does not charge a card. The API captures amount/currency and advances one billing cycle. A Jan 31 monthly plan renews on Feb 28, then Mar 31. One-time payments become cancelled; plans with auto-renew off become paused after payment.
- An expected due date and a unique billing-period index protect against double clicks, request retries and concurrent payment submissions. Subscription, payment and activity writes are transactional.
- Subscriptions with payments cannot be deleted; cancel them to retain history.
- Payment history is searchable and paginated across **all stored payments**, both in reports and in each subscription. The dashboard snapshot and “Export recent payments” use the latest 100 payments. The activity feed displays the latest 100 events; older events remain stored. “Export page” downloads the current ledger page. CSV exports defend against spreadsheet formula injection.
- Dashboard data refreshes every 60 seconds while visible. **Display mode** expands the dashboard for a company screen, with a clock and less navigation. Subscription cards rotate through pages of eight every 20 seconds. It uses the signed-in employee's access and expires with their session. Use a Viewer account on a shared display; no public kiosk URL is created.
- The renewal watch list is **in-app only**. Email, SMS, push and background reminders are not implemented; no mail service was configured.

## Files

From a saved subscription, open **Files** to upload a logo or documents.

- Maximum 10 MB per file, 20 documents per subscription.
- Accepted documents: PDF, JPG, PNG, WebP, GIF, DOCX, XLSX. Logos: JPG, PNG, WebP, GIF. File content is inspected, not just extensions.
- Logos use public Cloudinary image delivery. Only upload a non-confidential service/company logo.
- Attachments use Cloudinary **authenticated raw** delivery. The API checks the session and issues a signed download valid for two minutes; direct public attachment URLs are not exposed.
- File operations appear in the audit log. If Cloudinary cleanup fails after a record removal or logo replacement, the UI warns you to remove the orphaned asset manually from the configured Cloudinary folder.
- Application-level malware scanning is not included. Upload documents only from trusted company sources.

## Coolify: one Dockerfile

The root `Dockerfile` builds the client and runs the API plus compiled client in one container. Source code remains separated. No secrets are copied into the image.

1. Push the source and lockfile to your Git repository, excluding `.env`.
2. In Coolify, choose **Dockerfile** build pack, root build context, `/Dockerfile`.
3. Set the app's container port to **4000** and connect your HTTPS domain.
4. Set **runtime** environment variables:

```dotenv
NODE_ENV=production
MONGODB_URI=<your MongoDB replica-set/Atlas connection string>
APP_ORIGIN=https://subscriptions.your-company.com
COOKIE_SECURE=true
TRUST_PROXY=1
CLOUDINARY_URL=cloudinary://<api-key>:<api-secret>@<cloud-name>
CLOUDINARY_FOLDER=complaiance-subscriptions
```

`CLOUDINARY_BACKUP_URL` or separate credential fields can replace `CLOUDINARY_URL`. Do not put secrets in frontend/VITE variables. `APP_ORIGIN` must match the exact browser origin (scheme, host, optional port, no path). HTTPS and secure cookies are required in production. Add the Coolify server's egress IP to the database's authorized network access. The health check is `/api/health` and becomes healthy after MongoDB connects.

5. Deploy. Finish first administrator setup before sharing the app URL. Access should be restricted during this first setup window.

## Coolify: separate client and server containers

`client/Dockerfile`, `server/Dockerfile` and `compose.yaml` provide two containers. Build context is the repository root for both. The client runs Nginx on **8080** and proxies `/api` to the server on internal **4000**. Keep the API internal and route the public HTTPS domain to the client. `BACKEND_URL` defaults to `http://server:4000` and can be changed for a different internal service name.

```sh
docker compose up --build -d
```

For local HTTP the compose defaults to `NODE_ENV=development`, `COOKIE_SECURE=false`, `APP_ORIGIN=http://localhost:8080`. For Coolify set the production runtime values above; do not keep the development cookie defaults. When `WEB_PORT` changes locally, set `APP_ORIGIN` to that port too. Configure Coolify to expose **client port 8080**; do not expose the server port publicly.

## Validation

```sh
npm run check  # Server syntax, production build and screen render checks
npm test       # Unit tests + transactional integration suite
```

Tests create their own **disposable MongoDB replica set** through `mongodb-memory-server`; they never use the real `MONGODB_URI`. The first run downloads a MongoDB binary from the official MongoDB distribution (large on Windows). API coverage includes setup, sessions, temporary passwords, role/ownership permissions, concurrent duplicate payments, renewal anchors, exchange-rate validation, history retention and last-admin protection.

## Security and operations

Passwords are hashed with bcrypt; session tokens are random, stored as hashes in MongoDB, and sent in HttpOnly/SameSite Strict cookies. Sessions last seven days. Mutations require an exact allowed Origin, routes use validation and rate limits, and all server responses disable caching. Deploy behind one trusted reverse proxy by default; adjust `TRUST_PROXY` to your real proxy topology. Records use `subtrack_`-prefixed collections. Use a dedicated MongoDB database/user with limited access. Keep encrypted database backups and Cloudinary backups under your company's policies. Docker images run as non-root users and handle shutdown signals.

No public registration, email delivery, external SSO, actual payment processing, tenant isolation, or public sharing is configured. Account recovery is an administrator's temporary password reset; keep at least two trusted administrator accounts after setup.

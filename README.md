# AWS Cost & Usage Dashboard

A self-hosted AWS infrastructure monitoring dashboard.
**Frontend**: GitHub Pages · **Backend**: Render (free) · **Database**: Render PostgreSQL (free)

---

## What it does

- Connects to a single AWS account via read-only IAM credentials
- Shows month-by-month charts for: Bandwidth, CPU, RAM, Storage, Server Cost, Bandwidth Cost, Other Cost
- Select and compare multiple instances simultaneously or drill into one
- Friendly instance names via the Tags page
- Annotate charts with timestamped comments to explain anomalies
- Set email alerts with configurable thresholds (CPU >, cost >, etc.)
- **Admin** login: full access + creates/deletes viewer accounts
- **Viewer** logins: read-only access to all charts and alerts

---

## Architecture

```
Browser → GitHub Pages (React)
              ↕ HTTPS /api/*
         Render Web Service (Node.js/Express)
              ↕                    ↕
         Render PostgreSQL    AWS APIs (once/day)
         (serves all reads)   (CloudWatch + Cost Explorer)
```

### How data sync works

The dashboard never queries AWS live during normal use. Instead:

1. A **daily cron at 2:00 AM UTC (5:30 AM IST)** fetches the last 12 months of data from AWS CloudWatch and Cost Explorer
2. Results are stored in the `metrics_cache` and `instances_cache` PostgreSQL tables
3. Every dashboard request reads from the DB — instant response, zero AWS API cost during browsing
4. On **first deploy**, an automatic sync runs 5 seconds after startup to populate the cache
5. **Admin users** can trigger a manual sync at any time via the ↺ button in the header
6. The header shows "Synced Xh ago" so you always know how fresh the data is

---

## Step 1 — Fork / create the GitHub repo

1. Go to **github.com** → **New repository**
2. Name it `awsdash` (or anything you like)
3. Set it to **Private** (recommended — keeps your deployment config private)
4. Clone it locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/awsdash.git
   cd awsdash
   ```
5. Copy all the project files into the cloned folder
6. Push to GitHub:
   ```bash
   git add .
   git commit -m "initial commit"
   git push origin main
   ```

---

## Step 2 — Enable GitHub Pages

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. That's it — the workflow will deploy the frontend on every push to `main`

---

## Step 3 — Deploy backend on Render

1. Go to **render.com** → Sign up (free, no credit card needed)
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select the `awsdash` repo
4. Render reads `render.yaml` and creates:
   - `awsdash-api` — Node.js web service
   - `awsdash-db` — PostgreSQL database
5. Click **Apply** — the first deploy starts automatically

---

## Step 4 — Set environment variables on Render

After the first deploy, go to **Render Dashboard → awsdash-api → Environment** and set:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | `https://YOUR_USERNAME.github.io` |
| `AWS_ACCESS_KEY_ID` | Your IAM Access Key ID |
| `AWS_SECRET_ACCESS_KEY` | Your IAM Secret Access Key |
| `AWS_REGION` | e.g. `ap-south-1` |
| `ADMIN_USERNAME` | Your chosen admin username |
| `ADMIN_PASSWORD` | Strong password (min 10 chars) |
| `SMTP_HOST` *(optional)* | e.g. `smtp.gmail.com` |
| `SMTP_PORT` *(optional)* | `587` |
| `SMTP_USER` *(optional)* | your Gmail address |
| `SMTP_PASS` *(optional)* | Your Gmail App Password |
| `SMTP_FROM` *(optional)* | `"AWS Dashboard <you@gmail.com>"` |

> `JWT_SECRET` and `DATABASE_URL` are set automatically by Render — don't touch them.

After saving, Render **automatically redeploys**. Check the deploy log — you should see:
```
[db] Schema ready.
[startup] Admin user created.
[server] Listening on port 10000
```

---

## Step 5 — Set GitHub Actions secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|---|---|
| `VITE_API_URL` | Your Render backend URL + `/api`, e.g. `https://awsdash-api.onrender.com/api` |
| `VITE_BASE_PATH` | `/awsdash` (your repo name with a leading slash) |

Then trigger a redeploy: go to **Actions** tab → **Deploy Frontend to GitHub Pages** → **Run workflow**.

---

## Step 6 — First login

1. Open `https://YOUR_USERNAME.github.io/awsdash`
2. Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in Render
3. Go to **Users** → **Change Password** — change it immediately
4. Go to **Tags** → give your instances friendly names
5. Go to **Dashboard** → select instances → pick a date range → charts appear

---

## AWS IAM setup (read-only, no CLI needed)

1. Go to **AWS Console** → **IAM** → **Users** → **Create user**
2. Username: `aws-dashboard-readonly` (or anything)
3. **Attach policies directly** — add these four:
   - `CloudWatchReadOnlyAccess`
   - `AWSCostExplorerReadOnlyAccess`
   - `AmazonEC2ReadOnlyAccess`
   - `AmazonRDSReadOnlyAccess`
4. **Security credentials** tab → **Create access key**
5. Select **Application running outside AWS**
6. Copy the **Access Key ID** and **Secret Access Key** into Render env vars

> ⚠️ Never use root credentials. This IAM user is read-only and cannot modify anything.

### Enable Cost Explorer (one-time, console only)

Go to **AWS Console** → **Billing** → **Cost Explorer** → **Enable Cost Explorer**.
Takes up to 24 hours to show historical data. Free for basic monthly queries.

### Enable RAM metrics (optional)

RAM utilisation requires the CloudWatch Agent on each EC2 instance.
If not installed, the RAM chart will show no data — everything else works fine.

---

## Creating viewer accounts

1. Log in as admin
2. Go to **Users** → **+ New Viewer**
3. Set a username and password (min 10 chars)
4. Share credentials with the viewer — they log in at the same URL
5. Viewers can see all dashboards but cannot edit tags, comments, alerts, or users

---

## After code changes

Any `git push origin main` automatically:
- Rebuilds and redeploys the **frontend** via GitHub Actions (~1 min)
- Triggers a **backend** redeploy on Render (~2 min)

No SSH, no servers, no manual steps.

---

## Free tier limits

| Service | Free limit | Notes |
|---|---|---|
| GitHub Pages | Unlimited | Static hosting |
| Render Web Service | 750 hrs/month | Spins down after 15 min idle — first request takes ~30s to wake up |
| Render PostgreSQL | 1 GB storage | No expiry, persistent |
| AWS Cost Explorer | $0.01/request | ~$0.30/month typical usage |
| AWS CloudWatch | 1M API requests/month | Well within free tier |

---

## Project structure

```
awsdash/
├── .github/workflows/
│   └── deploy-frontend.yml   # Auto-deploys frontend to GitHub Pages
├── backend/
│   ├── server.js             # Express entry point + cron scheduler
│   ├── .env.example
│   ├── lib/
│   │   ├── db.js             # PostgreSQL schema (includes cache tables)
│   │   ├── awsClient.js      # AWS SDK clients
│   │   ├── awsFetcher.js     # CloudWatch + Cost Explorer queries
│   │   ├── syncEngine.js     # Daily sync — fetches AWS → writes to DB
│   │   └── alertEngine.js    # Cron alert checker + email
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       ├── metrics.js        # Reads from DB cache (not live AWS)
│       ├── sync.js           # /api/sync/status, /trigger, /history
│       ├── tags.js
│       ├── comments.js
│       └── alerts.js
├── frontend/
│   ├── src/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── ui.jsx
│   │   │   └── SyncBadge.jsx # "Synced Xh ago" + manual refresh button
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── Dashboard.jsx
│   │       ├── TagsPage.jsx
│   │       ├── AlertsPage.jsx
│   │       └── UsersPage.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── render.yaml               # Render Blueprint (backend + database)
└── README.md
```

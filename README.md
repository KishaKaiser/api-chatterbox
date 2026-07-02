# ✨ Chatter Box

A Vite + React + TypeScript AI chat application with per-user settings persistence, backed by a real Node.js/Express REST API and MySQL database.

---

## Architecture

| Layer | Technology |
|-------|------------|
| Frontend | Vite + React + TypeScript |
| Backend API | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | MySQL / MariaDB (CloudPanel default) |
| Auth | JWT (email + password, bcrypt hashing) |

---

## Local Development

### Prerequisites
- Node.js ≥ 18
- MySQL 8 or MariaDB 10.6+

### 1. Clone and install dependencies

```bash
git clone git@github.com:KishaKaiser/chatter-box.git
cd chatter-box
npm install                     # installs frontend deps + concurrently
npm install --prefix backend    # installs backend deps
```

### 2. Configure environment variables

**Frontend** (`.env.local` in repo root):
```bash
cp .env.example .env.local
# Edit VITE_API_BASE_URL=http://localhost:4000
```

**Backend** (`backend/.env`):
```bash
cp backend/.env.example backend/.env
# Edit DATABASE_URL, JWT_SECRET, CORS_ORIGIN, PORT
```

### 3. Create the database and run migrations

```bash
# Create the database in MySQL first, then:
cd backend
npx prisma migrate deploy
cd ..
```

### 4. Start both frontend and backend

```bash
npm run dev
# OR start separately:
npm run dev:frontend   # http://localhost:5173
npm run dev:backend    # http://localhost:4000
```

---

## REST API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login, returns JWT |
| GET | `/me` | Bearer JWT | Get current user profile |
| PUT | `/me` | Bearer JWT | Update user profile |
| GET | `/settings` | Bearer JWT | Get user settings (JSON) |
| PUT | `/settings` | Bearer JWT | Update/merge user settings |

---

## CloudPanel Deployment Guide

### Overview

You will create **two sites** on CloudPanel:

| Site | Domain | Type | What it serves |
|------|--------|------|----------------|
| Frontend | `yourdomain.com` | Static / Node.js | Built Vite assets (`dist/`) |
| Backend API | `api.yourdomain.com` | Node.js | Express REST API |

---

### Step 1 – Create the MySQL database

1. **CloudPanel → Databases → Add Database**
2. Fill in:
   - **Database name**: `chatter_box`
   - **Database user**: `chatter_box_user`
   - **Password**: *(generate a strong random password and save it)*
3. The host will be `127.0.0.1` (same server).
4. Note the connection string: `mysql://chatter_box_user:PASSWORD@127.0.0.1:3306/chatter_box`

---

### Step 2 – Deploy the backend API (`api.yourdomain.com`)

#### 2a) Create a Node.js site
1. **CloudPanel → Sites → Add Site**
2. Settings:
   - **Domain**: `api.yourdomain.com`
   - **Application**: `Node.js`
   - **Node.js version**: 18 or 20 LTS
3. Click **Add Site**.

#### 2b) Clone the repository
SSH into the server and go to the site directory:

```bash
cd /home/cloudpanel/htdocs/api.yourdomain.com
git clone git@github.com:KishaKaiser/chatter-box.git .
```

#### 2c) Install backend dependencies

```bash
cd backend
npm ci
```

#### 2d) Set environment variables
**CloudPanel → Sites → api.yourdomain.com → Environment Variables**

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (or CloudPanel's assigned port) |
| `DATABASE_URL` | `mysql://chatter_box_user:PASSWORD@127.0.0.1:3306/chatter_box` |
| `JWT_SECRET` | *(run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)* |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | `https://yourdomain.com,https://www.yourdomain.com` |

> **Security note**: Never commit `.env` to version control. The `JWT_SECRET` must be a long, random string.

#### 2e) Run database migrations

```bash
cd /home/cloudpanel/htdocs/api.yourdomain.com/backend
npx prisma migrate deploy
npx prisma generate
```

#### 2f) Build the TypeScript backend

```bash
npm run build
```

#### 2g) Set the start command
In **CloudPanel → Sites → api.yourdomain.com → Node.js**:
- **App root / working directory**: `backend`
- **Start command**: `node dist/index.js`

#### 2h) Enable HTTPS
**CloudPanel → Sites → api.yourdomain.com → SSL/TLS → Let's Encrypt**
- Issue certificate for `api.yourdomain.com`

---

### Step 3 – Deploy the frontend (`yourdomain.com`)

#### 3a) Create a static site
1. **CloudPanel → Sites → Add Site**
2. Settings:
   - **Domain**: `yourdomain.com` (and `www.yourdomain.com`)
   - **Application**: `Static` (or PHP 8.x used as a static host)

#### 3b) Clone the repository

```bash
cd /home/cloudpanel/htdocs/yourdomain.com
git clone git@github.com:KishaKaiser/chatter-box.git .
```

#### 3c) Set build-time environment variable

Vite bakes env vars in at **build time**, so set before building:

```bash
echo "VITE_API_BASE_URL=https://api.yourdomain.com" > .env.production
```

#### 3d) Install and build

```bash
npm ci
npm run build
```

This produces the `dist/` folder.

#### 3e) Point the web root to `dist/`
In CloudPanel, set the **Document Root** to the `dist` directory, e.g.:
`/home/cloudpanel/htdocs/yourdomain.com/dist`

#### 3f) Configure SPA routing
Add this to the Nginx vhost (CloudPanel → Sites → yourdomain.com → Vhost):

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

#### 3g) Enable HTTPS
**CloudPanel → Sites → yourdomain.com → SSL/TLS → Let's Encrypt**

---

### Step 4 – Nginx proxy for the backend

CloudPanel auto-generates a reverse proxy for Node.js sites. It should look like:

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

Make sure the port in `proxy_pass` matches your `PORT` env var.

---

### Step 5 – Verify the deployment

```bash
# Backend health check
curl https://api.yourdomain.com/health
# Expected: {"status":"ok","timestamp":"..."}

# Test registration
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123","username":"testuser"}'

# Open the frontend
open https://yourdomain.com
```

---

### Step 6 – Deploy updates

```bash
# On the server in the site root:
git pull

# Frontend update:
npm ci && npm run build
# (Document root still points to dist/ – no further step needed)

# Backend update:
cd backend
npm ci
npm run build
npx prisma migrate deploy
# Restart Node process via CloudPanel UI
```

---

## Security Notes

- JWT tokens are stored in `localStorage` for simplicity. For stronger XSS protection in production, consider using `httpOnly` cookies with a server-side refresh token strategy.
- Always set `JWT_SECRET` to a long, cryptographically random string (64+ hex chars).
- Always use HTTPS in production (Let's Encrypt is free and auto-managed by CloudPanel).
- `bcryptjs` uses cost factor 12 – suitable for most use cases.
- `CORS_ORIGIN` must list only your actual frontend domain(s) in production.

---

## Project Structure

```
chatter-box/
├── src/                    # Frontend (Vite + React)
│   ├── components/         # UI components
│   ├── hooks/              # React hooks (useLocalStorage, etc.)
│   ├── lib/                # Utilities (api.ts, utils.ts, ...)
│   └── App.tsx
├── backend/                # Backend API (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── routes/         # auth.ts, user.ts
│   │   ├── middleware/     # auth.ts (JWT middleware)
│   │   ├── lib/            # prisma.ts
│   │   └── index.ts        # Entry point
│   ├── prisma/
│   │   ├── schema.prisma   # DB schema (User + UserSettings)
│   │   └── migrations/     # SQL migration files
│   ├── .env.example
│   └── package.json
├── .env.example            # Frontend env vars example
└── package.json            # Root scripts (dev, build, etc.)
```

---

## License

MIT – see [LICENSE](LICENSE).

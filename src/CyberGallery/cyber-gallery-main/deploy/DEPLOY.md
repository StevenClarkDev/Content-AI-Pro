# Cyber Gallery — Production Deployment

Target: **Ubuntu 22.04/24.04 VPS** with **nginx + Let's Encrypt**, Node apps under **PM2**, Postgres + Redis in **Docker**, originals on **local disk**.

DNS prerequisites (set A records first, wait for propagation):
- `API_DOMAIN`  → server IP (e.g. `api.example.com`)
- `WEB_DOMAIN`  → server IP (e.g. `gallery.example.com`)

---

## 1. Server bootstrap (run once as root or with sudo)

```bash
apt update && apt -y upgrade
apt -y install git curl ufw nginx certbot python3-certbot-nginx \
                ca-certificates gnupg lsb-release build-essential

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs

# pnpm + pm2
npm i -g pnpm@9 pm2

# Docker (for Postgres + Redis)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Create directories:
```bash
mkdir -p /srv/cyber-gallery /srv/cyber-gallery/storage /var/log/cg
```

---

## 2. Clone repo & install

```bash
cd /srv
git clone <YOUR_REPO_URL> cyber-gallery
cd cyber-gallery

# pnpm needs hoisted node_modules for some deps
pnpm install --prod=false
```

---

## 3. Start Postgres + Redis

```bash
cd /srv/cyber-gallery/deploy
cp ../apps/api/.env.example .env  # only used to seed POSTGRES_PASSWORD below
# Set a strong password:
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env

docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml ps   # verify healthy
```

Note the password from `.env` — you'll use it in the API `.env` next.

---

## 4. Configure API

```bash
cp /srv/cyber-gallery/deploy/api.env.example /srv/cyber-gallery/apps/api/.env
nano /srv/cyber-gallery/apps/api/.env
```

Set these values:
- `DATABASE_URL=postgresql://cg:<PASSWORD>@127.0.0.1:5432/cyber_gallery?schema=public`
- `JWT_ACCESS_SECRET=$(openssl rand -hex 48)`
- `JWT_REFRESH_SECRET=$(openssl rand -hex 48)` *(different value)*
- `CORS_ORIGINS=https://WEB_DOMAIN`
- `STORAGE_ROOT=/srv/cyber-gallery/storage`

Run database migrations:
```bash
cd /srv/cyber-gallery/apps/api
npx prisma migrate deploy
npx prisma generate
```

Build all packages:
```bash
cd /srv/cyber-gallery
pnpm --filter @cg/shared build
pnpm --filter @cg/api    build
pnpm --filter @cg/web    build
```

---

## 5. Configure Web portal

```bash
cp /srv/cyber-gallery/deploy/web.env.example /srv/cyber-gallery/apps/web/.env.production
nano /srv/cyber-gallery/apps/web/.env.production
# Set NEXT_PUBLIC_API_BASE_URL=https://API_DOMAIN/api
```

Re-build web after editing env:
```bash
pnpm --filter @cg/web build
```

---

## 6. Launch with PM2

```bash
pm2 start /srv/cyber-gallery/deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root   # follow the printed instruction
```

Health check:
```bash
curl -s http://127.0.0.1:4817/api/health
curl -sI http://127.0.0.1:3001
pm2 status
pm2 logs cg-api --lines 50
```

---

## 7. Configure nginx + TLS

```bash
sed \
  -e "s/API_DOMAIN/api.example.com/g" \
  -e "s/WEB_DOMAIN/gallery.example.com/g" \
  /srv/cyber-gallery/deploy/nginx/cyber-gallery.conf \
  > /etc/nginx/sites-available/cyber-gallery

ln -sf /etc/nginx/sites-available/cyber-gallery /etc/nginx/sites-enabled/cyber-gallery
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
```

Issue Let's Encrypt certificates (will modify the nginx config in-place to add HTTPS):
```bash
certbot --nginx \
  -d api.example.com \
  -d gallery.example.com \
  --redirect --agree-tos -m you@example.com --no-eff-email
```

Renewal is automatic via the `certbot.timer` systemd unit.

---

## 8. Mobile app: point to production API

In [apps/mobile/src/config.ts](apps/mobile/src/config.ts):
```ts
export const API_BASE_URL = 'https://api.example.com/api';
```
Then rebuild a release APK:
```bash
cd apps/mobile/android
./gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

---

## 9. Updating after a code push

```bash
cd /srv/cyber-gallery
git pull
pnpm install
cd apps/api && npx prisma migrate deploy && cd ../..
pnpm --filter @cg/shared build
pnpm --filter @cg/api    build
pnpm --filter @cg/web    build
pm2 reload cg-api
pm2 reload cg-web
```

---

## 10. Backups (recommended)

Postgres dump cron (daily, keep 14 days):
```bash
mkdir -p /var/backups/cg
cat >/etc/cron.daily/cg-pg-dump <<'EOF'
#!/bin/sh
TS=$(date +%F)
docker exec cg-postgres pg_dump -U cg cyber_gallery | gzip \
  > /var/backups/cg/db-$TS.sql.gz
find /var/backups/cg -name 'db-*.sql.gz' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/cg-pg-dump
```

Storage tree (`/srv/cyber-gallery/storage`) — back up via `restic`, `borg`, or `rclone` to off-site. With ~5 GB per user this scales well.

---

## Security checklist

- [ ] Postgres + Redis bound to `127.0.0.1` only (already in compose file)
- [ ] Strong `JWT_*_SECRET` (≥48 random hex)
- [ ] Firewall: only 22, 80, 443 open
- [ ] `certbot renew --dry-run` succeeds
- [ ] PM2 set to start on boot (`pm2 startup`)
- [ ] Off-site backups configured

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` from nginx | `pm2 status` — process crashed; `pm2 logs cg-api` |
| `413 Request Entity Too Large` on upload | `client_max_body_size` in nginx (already set to 60M) |
| API can't connect to DB | Check `DATABASE_URL` host = `127.0.0.1` and password matches docker `.env` |
| Mobile uploads time out | Increase `proxy_read_timeout` in nginx; check device network |
| Thumbnails missing | `pm2 logs cg-api` for sharp/bullmq errors; verify `redis-cli ping` |

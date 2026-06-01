# nginx reverse proxy examples

Example configs for terminating TLS on the origin while **Cloudflare** proxies public traffic.

| Public URL | nginx `server_name` | Upstream (host) | Service |
|------------|---------------------|-----------------|---------|
| https://senkron.la | `senkron.la` | `127.0.0.1:3002` | `@senkronla/web` (`WEB_PUBLISH_PORT`) |
| https://sync.senkron.la | `sync.senkron.la` | `127.0.0.1:8080` | `@senkronla/server` (`ESR_PUBLISH_PORT`) |

Adjust upstream ports if your `.env` uses different `WEB_PUBLISH_PORT` / `ESR_PUBLISH_PORT`.

## Cloudflare DNS

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | origin server IP | Proxied (orange cloud) |
| A | `sync` | origin server IP | Proxied |
| CNAME | `www` | `senkron.la` | Proxied (optional) |

**SSL/TLS → Overview:** set mode to **Full (strict)** once the origin serves a valid certificate (Let's Encrypt or Cloudflare Origin Certificate).

**Network:** WebSockets are enabled by default on Cloudflare (required for `wss://sync.senkron.la/.../notifications`).

Optional hardening:

- **SSL/TLS → Edge Certificates → Always Use HTTPS**
- **SSL/TLS → Origin Server → Authenticated Origin Pulls** (requires extra nginx `ssl_client_certificate` — not in these minimal examples)

## Origin `.env`

```bash
ESR_PUBLIC_URL=https://sync.senkron.la
ESR_CORS_ORIGINS=https://senkron.la
WEB_PUBLISH_PORT=3002
ESR_PUBLISH_PORT=8080
```

Docker Compose maps `NEXT_PUBLIC_API_URL` from `ESR_PUBLIC_URL` for the web container.

## Install on the server

```bash
sudo apt install nginx certbot python3-certbot-nginx   # Debian/Ubuntu

sudo cp docker/nginx/cloudflare-real-ip.conf /etc/nginx/snippets/cloudflare-real-ip.conf
sudo cp docker/nginx/senkron.la.conf /etc/nginx/sites-available/senkron.la
sudo cp docker/nginx/sync.senkron.la.conf /etc/nginx/sites-available/sync.senkron.la
sudo ln -sf /etc/nginx/sites-available/senkron.la /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/sync.senkron.la /etc/nginx/sites-enabled/

# Certificates (DNS must already point here, or use Cloudflare DNS validation)
sudo certbot certonly --nginx -d senkron.la -d www.senkron.la
sudo certbot certonly --nginx -d sync.senkron.la

sudo nginx -t && sudo systemctl reload nginx
```

### Cloudflare Origin Certificate (alternative to Let's Encrypt)

1. Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate**
2. Save cert/key on the server (e.g. `/etc/ssl/cloudflare/senkron.la.pem`)
3. Replace `ssl_certificate` / `ssl_certificate_key` paths in both `.conf` files

## Verify

```bash
curl -sI https://senkron.la | head
curl -s https://sync.senkron.la/health
```

WebSocket path (after pairing): `wss://sync.senkron.la/v1/namespaces/{namespaceId}/notifications`

See [docs/en/13-WEBSOCKET-NOTIFICATIONS.md](../../docs/en/13-WEBSOCKET-NOTIFICATIONS.md) §8.1 for protocol details.

# easy-viewer deployment

## Quick public URL, no server required

Run from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy_cloudflare_tunnel.ps1
```

The script starts easy-viewer locally and opens a Cloudflare quick tunnel. Copy the `https://*.trycloudflare.com` URL from the terminal.

This is best for temporary sharing or testing.

## Fixed domain

For a stable public domain, create a named Cloudflare Tunnel in the Cloudflare dashboard, protect it with Cloudflare Access, and point it to:

```text
http://127.0.0.1:8898
```

## Production app start only

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_viewer_prod.ps1 -HostName 127.0.0.1 -Port 8898
```

For LAN exposure:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_viewer_prod.ps1 -HostName 0.0.0.0 -Port 8898
```

## Security reminder

Do not expose this app publicly without access control. It contains database-changing operations.

## Aliyun Linux without systemd

Copy the project to the server, then run:

```bash
chmod +x scripts/start_linux.sh scripts/stop_linux.sh scripts/status_linux.sh
```

Start:

```bash
./scripts/start_linux.sh
```

Stop:

```bash
./scripts/stop_linux.sh
```

Status:

```bash
./scripts/status_linux.sh
```

Defaults:

```text
Host: 127.0.0.1
Port: 8898
PID:  .tmp/easy-viewer.pid
Logs: .tmp/easy-viewer.out.log / .tmp/easy-viewer.err.log
```

To expose on all network interfaces:

```bash
EASY_VIEWER_HOST=0.0.0.0 EASY_VIEWER_PORT=8898 ./scripts/start_linux.sh
```

For public deployment, prefer Nginx HTTPS reverse proxy to `127.0.0.1:8898`.

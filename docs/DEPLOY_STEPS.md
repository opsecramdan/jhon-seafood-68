# Dokumentasi Langkah Deploy Production — Jhon Seafood 68

Server production: EC2 `i-01a5fce1bf5b9fb05` (t3.micro, Jakarta ap-southeast-3)
IP: `16.79.143.87`
Domain: `jhon86.16-79-143-87.nip.io`

---

## Step 7: Instalasi Software di Server (via SSH)

### 7.1 Koneksi SSH ke EC2

```bash
ssh -i ~/.ssh/jhonseafood-key.pem ec2-user@16.79.143.87
```

### 7.2 Update sistem

```bash
sudo dnf update -y
```

### 7.3 Install Node.js 22

```bash
# Download Node.js 22.x setup script dari NodeSource
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -

# Install Node.js
sudo dnf install -y nodejs

# Verifikasi versi
node -v  # v22.9.0 atau lebih baru
npm -v   # 10.8.3 atau lebih baru
```

### 7.4 Install Nginx

```bash
sudo dnf install -y nginx

# Verifikasi
nginx -v  # nginx/1.24.0

# Enable & start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 7.5 Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Verifikasi
pm2 -v  # 5.4.2 atau lebih baru
```

### 7.6 Install Git

```bash
sudo dnf install -y git

git --version  # git version 2.40.1 atau lebih baru
```

### 7.7 Install Certbot (Let's Encrypt)

```bash
# Install Python virtual environment
sudo dnf install -y python3 python3-pip

# Create dedicated venv for Certbot
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx

# Create symlink
sudo ln -s /opt/certbot/bin/certbot /usr/bin/certbot

# Verifikasi
certbot --version  # certbot 2.11.0 atau lebih baru
```

---

## Step 8: Deploy Aplikasi

### 8.1 Clone Repository

```bash
cd ~
git clone https://github.com/opsecramdan/jhon-seafood-68.git
cd jhon-seafood-68/app
```

### 8.2 Install Dependencies

```bash
npm install --omit=dev
```

Output dependencies utama:
- express@4.19.2
- ejs@3.1.10
- sql.js@1.11.0
- bcryptjs@2.4.3
- express-session@1.18.0
- multer@1.4.5-lts.1

### 8.3 Konfigurasi .env (Production)

```bash
# Generate SESSION_SECRET (random 32 bytes hex)
SESSION_SECRET=$(openssl rand -hex 32)

# Generate admin password (contoh: CiFTG5WTh5aT)
ADMIN_PASS="CiFTG5WTh5aT"
ADMIN_HASH=$(node -e "console.log(require('bcryptjs').hashSync('$ADMIN_PASS', 10))")

# Buat file .env
cat > .env <<EOF
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$ADMIN_HASH
SESSION_SECRET=$SESSION_SECRET
NODE_ENV=production
EOF

# Set permissions ketat (hanya owner bisa read/write)
chmod 600 .env
```

### 8.4 Test Run Manual (opsional)

```bash
node server.js
# Tekan Ctrl+C setelah verifikasi "Server running on port 3000"
```

### 8.5 Jalankan dengan PM2

```bash
pm2 start server.js --name jhonseafood

# Verifikasi status
pm2 status

# Lihat logs
pm2 logs jhonseafood --lines 50

# Save PM2 process list
pm2 save
```

### 8.6 Setup PM2 Auto-Start (systemd)

```bash
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# PENTING: Copy-paste command output dari perintah di atas, lalu jalankan.
# Contoh output:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user
# ^ Jalankan command tersebut (sudah include sudo)

# Setelah itu, enable systemd service
sudo systemctl enable pm2-ec2-user
```

Verifikasi auto-start bekerja:
```bash
sudo systemctl status pm2-ec2-user
```

---

## Step 9: Konfigurasi Nginx Reverse Proxy

### 9.1 Backup Nginx Config Default

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
```

### 9.2 Hapus Default Server Block

Edit `/etc/nginx/nginx.conf`:

```bash
sudo vi /etc/nginx/nginx.conf
```

Cari blok `server { ... }` di dalam `http { ... }` dan hapus atau comment out seluruh blok tersebut.

### 9.3 Buat Config Khusus untuk Jhon Seafood

```bash
sudo tee /etc/nginx/conf.d/jhonseafood.conf > /dev/null <<'EOF'
upstream jhonseafood_app {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name 16-79-143-87.nip.io jhon86.16-79-143-87.nip.io;

    location / {
        proxy_pass http://jhonseafood_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint (passthrough langsung ke app)
    location = /health {
        proxy_pass http://jhonseafood_app/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
}
EOF
```

### 9.4 Test Konfigurasi Nginx

```bash
sudo nginx -t
```

Output harus: `syntax is ok` dan `test is successful`.

### 9.5 Restart Nginx

```bash
sudo systemctl restart nginx
```

### 9.6 Verifikasi

```bash
curl -I http://16.79.143.87/
# HTTP/1.1 200 OK

curl http://16.79.143.87/health
# Output: OK
```

---

## Step 10: Pemasangan SSL (Let's Encrypt)

### 10.1 Pastikan Domain Resolve ke IP

```bash
dig +short jhon86.16-79-143-87.nip.io
# Output: 16.79.143.87

ping -c 2 jhon86.16-79-143-87.nip.io
```

### 10.2 Jalankan Certbot

```bash
sudo certbot --nginx -d jhon86.16-79-143-87.nip.io -d 16-79-143-87.nip.io \
  --non-interactive \
  --agree-tos \
  -m opsecramdan@gmail.com \
  --redirect
```

Output expected:
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/jhon86.16-79-143-87.nip.io/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/jhon86.16-79-143-87.nip.io/privkey.pem
```

Certbot otomatis:
- Edit `/etc/nginx/conf.d/jhonseafood.conf` → tambah blok `server { listen 443 ssl; ... }`
- Tambah redirect HTTP → HTTPS
- Reload Nginx

### 10.3 Verifikasi SSL

```bash
curl -I https://jhon86.16-79-143-87.nip.io/
# HTTP/2 200 OK

curl https://jhon86.16-79-143-87.nip.io/health
# Output: OK
```

Browser test:
- Buka `https://jhon86.16-79-143-87.nip.io/`
- Klik padlock icon → Certificate valid, issued by Let's Encrypt

### 10.4 Setup Auto-Renew (Systemd Timer)

Let's Encrypt cert expire setiap 90 hari. Certbot sudah install systemd timer default:

```bash
# Cek timer status
sudo systemctl status certbot-renew.timer

# Jika tidak ada, buat manual:
sudo tee /etc/systemd/system/certbot-renew.service > /dev/null <<'EOF'
[Unit]
Description=Certbot Renewal

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

sudo tee /etc/systemd/system/certbot-renew.timer > /dev/null <<'EOF'
[Unit]
Description=Certbot Renewal Timer

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Enable & start timer
sudo systemctl daemon-reload
sudo systemctl enable certbot-renew.timer
sudo systemctl start certbot-renew.timer
```

Verifikasi timer:
```bash
sudo systemctl list-timers --all | grep certbot
```

Test dry-run renewal:
```bash
sudo certbot renew --dry-run
```

---

## Verifikasi Akhir

### Checklist Production Readiness

- [ ] Aplikasi accessible via HTTPS: `https://jhon86.16-79-143-87.nip.io/`
- [ ] HTTP auto-redirect ke HTTPS
- [ ] `/health` endpoint return "OK"
- [ ] Admin login works: `https://jhon86.16-79-143-87.nip.io/admin/login`
- [ ] PM2 running & auto-start enabled
- [ ] Nginx config syntax OK
- [ ] SSL cert valid (Let's Encrypt)
- [ ] Auto-renew timer active
- [ ] Security Group: SSH port 22 hanya dari IP admin, port 80/443 public
- [ ] CloudWatch Alarm setup (done di AWS Console)
- [ ] AWS Budget alert setup (done di AWS Console)

### Monitoring Commands

```bash
# Cek status aplikasi
pm2 status
pm2 logs jhonseafood --lines 100

# Cek Nginx
sudo systemctl status nginx
sudo nginx -t

# Cek SSL cert expiry
sudo certbot certificates

# Cek disk usage
df -h

# Cek memory
free -h

# Cek network connections
sudo ss -tunlp | grep -E ':(22|80|443|3000)'
```

---

## Troubleshooting

### App tidak start setelah reboot

```bash
# Cek PM2 systemd service
sudo systemctl status pm2-ec2-user

# Restart PM2
pm2 resurrect
pm2 restart jhonseafood
```

### Nginx 502 Bad Gateway

```bash
# Cek app masih running
pm2 status

# Cek app logs
pm2 logs jhonseafood

# Restart app
pm2 restart jhonseafood

# Cek Nginx error log
sudo tail -f /var/log/nginx/error.log
```

### SSL cert tidak auto-renew

```bash
# Test renewal manual
sudo certbot renew --dry-run

# Cek timer
sudo systemctl status certbot-renew.timer

# Restart timer
sudo systemctl restart certbot-renew.timer
```

---

**Dokumentasi ini ditulis berdasarkan langkah aktual yang dilakukan saat setup production server EC2 untuk Jhon Seafood 68.**

**Terakhir diupdate:** 16 Oktober 2026

# Panduan Praktik Step-by-Step: Deploy Jhon Seafood 68 ke AWS (dari Nol)

> **Tujuan:** Dokumen ini adalah checklist kerja sekaligus kerangka laporan.
> Setiap langkah punya instruksi eksekusi + nama file screenshot wajib.
> Simpan semua screenshot ke folder: `docs/screenshots/rebuild/` dengan
> nama file **persis** seperti yang tercantum di tiap langkah, supaya mudah
> disusun otomatis ke laporan Word nanti.
>
> **Catatan penting:** Infrastruktur lama (VPC default, EC2 `i-01a5fce1bf5b9fb05`)
> akan di-replace dengan infrastruktur baru yang dibuat manual (VPC custom,
> subnet, route table, dst) agar seluruh proses networking punya bukti nyata.

---

## FASE 0 — Persiapan Akun AWS

### Langkah 0.1 — Akun AWS

> **Catatan:** Registrasi akun AWS baru WAJIB pakai kartu kredit/debit untuk
> verifikasi (walau tetap $0 ditagih selama di Free Tier/kredit). Karena
> kalian **sudah punya akun AWS** (akun yang sama dipakai untuk instance
> yang sekarang berjalan), **TIDAK PERLU daftar ulang** — cukup dokumentasikan
> akun yang sudah ada sebagai bukti kepemilikan. Mendaftar akun kedua hanya
> menambah risiko verifikasi kartu tanpa manfaat untuk laporan ini.

**Langkah dokumentasi akun existing:**
1. Login ke [AWS Console](https://console.aws.amazon.com) dengan akun yang sudah ada
2. Klik nama akun di kanan atas → **Account**
3. Screenshot halaman yang menampilkan Account ID, nama akun, tanggal dibuat

📸 **Screenshot:** `00-01-account-info.png`

> *(Bagian sign-up/kartu kredit TIDAK perlu di-screenshot ulang karena akun
> sudah ada sejak sebelumnya — langkah ini hanya relevan kalau benar-benar
> membuat akun AWS dari nol, yang TIDAK kita lakukan di sini.)*

### Langkah 0.2 — Cek Skema Free Tier / Kredit
1. Buka **Billing and Cost Management** → **Credits** (atau **Free Tier** di sidebar)
2. Screenshot halaman yang menunjukkan skema akun kalian (750 jam/bulan 12 bulan ATAU kredit $200 dengan masa berlaku)

📸 **Screenshot:** `00-05-billing-freetier-scheme.png`

### Langkah 0.3 — Pilih Region Jakarta
1. Klik dropdown region di kanan atas (biasanya tertulis nama region aktif)
2. Pilih **Asia Pacific (Jakarta) ap-southeast-3**
3. Screenshot dropdown region yang menunjukkan Jakarta terpilih

📸 **Screenshot:** `00-06-region-jakarta-selected.png`

---

## FASE 1 — IAM (Identity and Access Management)

### Langkah 1.1 — Aktifkan MFA untuk Root User
1. **IAM** → **Dashboard** → **Security recommendations** → **Add MFA**
2. Setup MFA (Authenticator App/Virtual MFA)
3. Screenshot halaman konfirmasi MFA aktif (jangan screenshot QR code/secret key)

📸 **Screenshot:** `01-01-root-mfa-enabled.png`

### Langkah 1.2 — Buat Password Policy
1. **IAM** → **Account settings** → **Password policy** → **Edit**
2. Set minimal 12 karakter, wajib huruf besar/kecil/angka/simbol, expire policy
3. Screenshot halaman password policy tersimpan

📸 **Screenshot:** `01-02-password-policy.png`

### Langkah 1.3 — Buat 4 IAM User Sesuai Role Tim
1. **IAM** → **Users** → **Create user**
2. Buat user untuk masing-masing:
   - `ramadan-architect` (Cloud Architect/Ketua) — AdministratorAccess (scoped ke project)
   - `daffa-infra` (Infrastructure Engineer) — EC2FullAccess + VPCFullAccess
   - `gopriadi-security` (Security Officer) — IAMReadOnlyAccess + SecurityHubFullAccess
   - `deka-cost` (Cost Analyst) — Billing + CloudWatchReadOnlyAccess
3. Screenshot daftar 4 user yang sudah dibuat

📸 **Screenshot:** `01-03-iam-users-list.png`

### Langkah 1.4 — Screenshot Detail Policy per User (opsional tapi disarankan)
Screenshot halaman **Permissions** untuk salah satu user (misal `daffa-infra`) yang menunjukkan policy yang di-attach.

📸 **Screenshot:** `01-04-iam-user-permissions-example.png`

---

## FASE 2 — Networking: VPC, Subnet, Internet Gateway, Route Table

> **Ini bagian paling penting yang diminta dosen** — jangan pakai VPC default!

### Langkah 2.1 — Buat VPC Baru
1. **VPC Dashboard** → **Your VPCs** → **Create VPC**
2. Pilih **VPC only**
3. Isi:
   - Name tag: `jhonseafood-vpc`
   - IPv4 CIDR: `10.0.0.0/16`
4. Klik **Create VPC**
5. Screenshot halaman konfirmasi VPC baru dibuat (tampilkan VPC ID, CIDR, status Available)

📸 **Screenshot:** `02-01-vpc-created.png`

### Langkah 2.2 — Buat Subnet Publik
1. **VPC Dashboard** → **Subnets** → **Create subnet**
2. Pilih VPC `jhonseafood-vpc`
3. Isi:
   - Subnet name: `jhonseafood-public-subnet`
   - Availability Zone: `ap-southeast-3a`
   - IPv4 CIDR: `10.0.1.0/24`
4. Klik **Create subnet**
5. Screenshot halaman konfirmasi subnet dibuat

📸 **Screenshot:** `02-02-subnet-created.png`

### Langkah 2.3 — Enable Auto-Assign Public IP di Subnet
1. Pilih subnet `jhonseafood-public-subnet` → **Actions** → **Edit subnet settings**
2. Centang **Enable auto-assign public IPv4 address**
3. Save
4. Screenshot setting tersimpan

📸 **Screenshot:** `02-03-subnet-auto-assign-ip.png`

### Langkah 2.4 — Buat Internet Gateway
1. **VPC Dashboard** → **Internet Gateways** → **Create internet gateway**
2. Name tag: `jhonseafood-igw`
3. Klik **Create internet gateway**
4. Screenshot IGW dibuat (status: detached)

📸 **Screenshot:** `02-04-igw-created.png`

### Langkah 2.5 — Attach Internet Gateway ke VPC
1. Pilih IGW `jhonseafood-igw` → **Actions** → **Attach to VPC**
2. Pilih `jhonseafood-vpc`
3. Klik **Attach internet gateway**
4. Screenshot status IGW berubah jadi **Attached**

📸 **Screenshot:** `02-05-igw-attached.png`

### Langkah 2.6 — Buat Route Table Baru
1. **VPC Dashboard** → **Route Tables** → **Create route table**
2. Name tag: `jhonseafood-public-rt`
3. VPC: `jhonseafood-vpc`
4. Klik **Create route table**
5. Screenshot route table dibuat

📸 **Screenshot:** `02-06-route-table-created.png`

### Langkah 2.7 — Tambah Route ke Internet Gateway
1. Pilih `jhonseafood-public-rt` → tab **Routes** → **Edit routes**
2. **Add route**: Destination `0.0.0.0/0` → Target: Internet Gateway `jhonseafood-igw`
3. Save changes
4. Screenshot tabel routes yang menunjukkan route `0.0.0.0/0 → igw-xxxxx`

📸 **Screenshot:** `02-07-route-table-igw-route.png`

### Langkah 2.8 — Associate Route Table ke Subnet
1. Pilih `jhonseafood-public-rt` → tab **Subnet associations** → **Edit subnet associations**
2. Centang `jhonseafood-public-subnet`
3. Save associations
4. Screenshot konfirmasi subnet association

📸 **Screenshot:** `02-08-route-table-subnet-association.png`

---

## FASE 3 — Security Group & Key Pair

### Langkah 3.1 — Buat Security Group
1. **EC2 Dashboard** → **Security Groups** → **Create security group**
2. Name: `jhonseafood-sg`
3. VPC: `jhonseafood-vpc`
4. Inbound rules:
   - SSH (22) — Source: **My IP** (IP admin kalian)
   - HTTP (80) — Source: Anywhere (0.0.0.0/0)
   - HTTPS (443) — Source: Anywhere (0.0.0.0/0)
5. Klik **Create security group**
6. Screenshot halaman detail SG yang menunjukkan ketiga inbound rules

📸 **Screenshot:** `03-01-security-group-rules.png`

### Langkah 3.2 — Buat Key Pair SSH
1. **EC2 Dashboard** → **Key Pairs** → **Create key pair**
2. Name: `jhonseafood-key`
3. Type: RSA, format `.pem`
4. Download otomatis ke komputer kalian
5. Screenshot konfirmasi key pair terdaftar di list (JANGAN screenshot isi file .pem)

📸 **Screenshot:** `03-02-keypair-created.png`

---

## FASE 4 — Launch EC2 Instance ke VPC Custom

### Langkah 4.1 — Launch Instance
1. **EC2 Dashboard** → **Instances** → **Launch instance**
2. Name: `jhonseafood-68-web`
3. AMI: **Amazon Linux 2023**
4. Instance type: **t3.micro** (Free tier eligible)
5. Key pair: `jhonseafood-key`
6. **Network settings** → Edit:
   - VPC: `jhonseafood-vpc`
   - Subnet: `jhonseafood-public-subnet`
   - Auto-assign public IP: **Enable**
   - Security Group: pilih existing `jhonseafood-sg`
7. Storage: 8 GiB gp3 (default, masih Free Tier)
8. Klik **Launch instance**
9. Screenshot halaman **Launch successful** dengan instance ID

📸 **Screenshot:** `04-01-launch-instance-success.png`

### Langkah 4.2 — Verifikasi Instance Running
1. Tunggu status **Running** dan **2/2 checks passed**
2. Screenshot halaman detail instance (tab Details) yang menunjukkan:
   - Instance ID
   - VPC ID = `jhonseafood-vpc`
   - Subnet ID = `jhonseafood-public-subnet`
   - Public IPv4 address
   - Status: Running

📸 **Screenshot:** `04-02-instance-running-detail.png`

---

## FASE 5 — Elastic IP

### Langkah 5.1 — Alokasikan Elastic IP
1. **EC2 Dashboard** → **Elastic IPs** → **Allocate Elastic IP address**
2. Network Border Group: default (Jakarta)
3. Klik **Allocate**
4. Screenshot Elastic IP yang baru dialokasikan

📸 **Screenshot:** `05-01-eip-allocated.png`

### Langkah 5.2 — Associate Elastic IP ke Instance
1. Pilih Elastic IP → **Actions** → **Associate Elastic IP address**
2. Resource type: Instance
3. Pilih `jhonseafood-68-web`
4. Klik **Associate**
5. Screenshot konfirmasi EIP terhubung ke instance (tampilkan IP + instance ID)

📸 **Screenshot:** `05-02-eip-associated.png`

### Langkah 5.3 — Test Ping / Konektivitas Dasar
```bash
ping -c 4 <ELASTIC_IP>
```
Screenshot terminal hasil ping sukses (reply dari IP tersebut).

📸 **Screenshot:** `05-03-ping-test.png`

---

## FASE 6 — Instalasi Software di Server (via SSH)

### Langkah 6.1 — SSH ke Server
```bash
chmod 400 ~/.ssh/jhonseafood-key.pem
ssh -i ~/.ssh/jhonseafood-key.pem ec2-user@<ELASTIC_IP>
```
Screenshot terminal berhasil login (prompt `[ec2-user@ip-xxx ~]$`).

📸 **Screenshot:** `06-01-ssh-login-success.png`

### Langkah 6.2 — Install Node.js 22
```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```
📸 **Screenshot:** `06-02-nodejs-version.png`

### Langkah 6.3 — Install Nginx
```bash
sudo dnf install -y nginx
nginx -v
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl status nginx
```
📸 **Screenshot:** `06-03-nginx-status.png`

### Langkah 6.4 — Install PM2
```bash
sudo npm install -g pm2
pm2 -v
```
📸 **Screenshot:** `06-04-pm2-version.png`

### Langkah 6.5 — Install Certbot
```bash
sudo dnf install -y python3 python3-pip
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -s /opt/certbot/bin/certbot /usr/bin/certbot
certbot --version
```
📸 **Screenshot:** `06-05-certbot-version.png`

---

## FASE 7 — Deploy Aplikasi

### Langkah 7.1 — Clone Repository & Install Dependencies
```bash
cd ~
git clone https://github.com/opsecramdan/jhon-seafood-68.git
cd jhon-seafood-68/app
npm install --omit=dev
```
📸 **Screenshot:** `07-01-npm-install-success.png`

### Langkah 7.2 — Konfigurasi .env
```bash
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_HASH=$(node -e "console.log(require('bcryptjs').hashSync('<password_admin>', 10))")

cat > .env <<EOF
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$ADMIN_HASH
SESSION_SECRET=$SESSION_SECRET
NODE_ENV=production
EOF
chmod 600 .env
cat .env   # pastikan muncul isinya, lalu screenshot dengan password/hash di-BLUR
```
📸 **Screenshot:** `07-02-env-configured.png` *(blur SESSION_SECRET & ADMIN_PASSWORD_HASH sebelum screenshot)*

### Langkah 7.3 — Jalankan dengan PM2
```bash
pm2 start server.js --name jhonseafood
pm2 status
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user
# jalankan command sudo yang muncul dari output di atas
sudo systemctl enable pm2-ec2-user
```
📸 **Screenshot:** `07-03-pm2-status-running.png`

---

## FASE 8 — Konfigurasi Nginx Reverse Proxy

### Langkah 8.1 — Buat Config Nginx
```bash
sudo tee /etc/nginx/conf.d/jhonseafood.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name <ELASTIC_IP_DASH>.nip.io;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
EOF
sudo nginx -t
sudo systemctl restart nginx
```
📸 **Screenshot:** `08-01-nginx-config-test-ok.png`

### Langkah 8.2 — Verifikasi Akses via HTTP (Sebelum SSL)
```bash
curl -I http://<ELASTIC_IP>/
curl http://<ELASTIC_IP>/health
```
📸 **Screenshot:** `08-02-curl-http-200-health-ok.png`

### Langkah 8.3 — Verifikasi di Browser
Buka `http://<ELASTIC_IP>/` di browser → screenshot halaman utama tampil.

📸 **Screenshot:** `08-03-browser-http-homepage.png`

---

## FASE 9 — SSL dengan Let's Encrypt

### Langkah 9.1 — Jalankan Certbot
```bash
sudo certbot --nginx -d <domain>.nip.io --non-interactive --agree-tos -m <email> --redirect
```
📸 **Screenshot:** `09-01-certbot-success.png`

### Langkah 9.2 — Verifikasi HTTPS
```bash
curl -I https://<domain>.nip.io/
curl https://<domain>.nip.io/health
```
📸 **Screenshot:** `09-02-curl-https-200.png`

### Langkah 9.3 — Verifikasi di Browser (Padlock Icon)
Buka `https://<domain>.nip.io/` → klik padlock → screenshot certificate valid.

📸 **Screenshot:** `09-03-browser-https-padlock-valid.png`

### Langkah 9.4 — Setup Auto-Renew
```bash
sudo systemctl list-timers --all | grep certbot
sudo certbot renew --dry-run
```
📸 **Screenshot:** `09-04-certbot-autorenew-dryrun.png`

---

## FASE 10 — Monitoring & Budget

### Langkah 10.1 — Setup AWS Budget
1. **Billing** → **Budgets** → **Create budget**
2. Budget amount: $0.01
3. Alert threshold: 80% / 100%
4. Email notification ke email admin
5. Screenshot budget tersimpan

📸 **Screenshot:** `10-01-budget-created.png`

### Langkah 10.2 — Setup CloudWatch Alarm
1. **CloudWatch** → **Alarms** → **Create alarm**
2. Metric: EC2 → Per-Instance Metrics → `StatusCheckFailed`
3. Threshold: >= 1 selama 2 periode
4. SNS Topic baru/existing → email admin
5. Screenshot alarm created (state: OK/INSUFFICIENT_DATA)

📸 **Screenshot:** `10-02-cloudwatch-alarm-created.png`

### Langkah 10.3 — Konfirmasi Subscription Email SNS
Screenshot email konfirmasi subscription SNS yang sudah di-klik "Confirm".

📸 **Screenshot:** `10-03-sns-email-confirmed.png`

---

## FASE 11 — Verifikasi Final & Fitur Aplikasi

### Langkah 11.1 — Halaman Utama Publik
Screenshot halaman utama menampilkan nama UMKM, deskripsi, minimal 5 produk + harga, footer nomor kelompok & nama anggota.

📸 **Screenshot:** `11-01-homepage-public.png`

### Langkah 11.2 — Form Pemesanan
Screenshot proses pemesanan: pilih produk → isi nama + no HP → submit → halaman konfirmasi.

📸 **Screenshot:** `11-02-order-flow.png` (bisa beberapa file: `11-02a`, `11-02b`, dst)

### Langkah 11.3 — Health Endpoint
Screenshot browser menampilkan `OK` di endpoint `/health`.

📸 **Screenshot:** `11-03-health-endpoint-ok.png`

### Langkah 11.4 — Admin Login & Panel
Screenshot halaman login admin, lalu dashboard admin (CRUD produk, kelola pesanan).

📸 **Screenshot:** `11-04-admin-login.png`, `11-05-admin-dashboard.png`

### Langkah 11.5 — Multi-Admin Feature
Screenshot halaman `/admin/users` menunjukkan lebih dari 1 admin terdaftar.

📸 **Screenshot:** `11-06-multi-admin-list.png`

---

## FASE 12 — Backup & Uji Restore

### Langkah 12.1 — Backup Database
```bash
mkdir -p ~/backup
cp ~/jhon-seafood-68/app/data/jhonseafood.sqlite ~/backup/jhonseafood-$(date +%Y%m%d).sqlite
ls -la ~/backup/
```
📸 **Screenshot:** `12-01-backup-file-created.png`

### Langkah 12.2 — Snapshot EBS Volume
1. **EC2** → **Volumes** → pilih volume instance → **Actions** → **Create snapshot**
2. Screenshot snapshot created (status: pending/completed)

📸 **Screenshot:** `12-02-ebs-snapshot-created.png`

### Langkah 12.3 — Uji Restore
1. Hapus/ubah 1 baris data produk via admin panel (screenshot sebelum & sesudah)
2. Restore dari backup file (`cp` file backup kembali, restart app)
3. Screenshot data kembali normal setelah restore

📸 **Screenshot:** `12-03-before-delete.png`, `12-04-after-restore.png`

---

## FASE 13 — Billing Aktual (Bukti Biaya Nyata)

### Langkah 13.1 — Cost Explorer
1. **Billing** → **Cost Explorer**
2. Screenshot grafik biaya bulan berjalan (harus menunjukkan $0 atau mendekati $0)

📸 **Screenshot:** `13-01-cost-explorer-actual.png`

---

## Checklist Ringkas (Centang Saat Selesai)

- [ ] 00 — Akun AWS & Free Tier scheme
- [ ] 01 — IAM (MFA, password policy, 4 user)
- [ ] 02 — VPC, Subnet, IGW, Route Table (8 langkah)
- [ ] 03 — Security Group & Key Pair
- [ ] 04 — Launch EC2 ke VPC custom
- [ ] 05 — Elastic IP
- [ ] 06 — Install software (Node, Nginx, PM2, Certbot)
- [ ] 07 — Deploy aplikasi + PM2
- [ ] 08 — Nginx reverse proxy
- [ ] 09 — SSL Let's Encrypt
- [ ] 10 — Budget & CloudWatch Alarm
- [ ] 11 — Verifikasi fitur aplikasi
- [ ] 12 — Backup & restore
- [ ] 13 — Billing aktual

**Total screenshot wajib:** ±45 file (boleh lebih jika pakai multi-step per langkah)

---

## Catatan untuk Penyusunan Laporan Nanti

Setelah semua screenshot terkumpul di `docs/screenshots/rebuild/`, kita akan:
1. Update `laporan-draft.md` dengan menyisipkan referensi tiap screenshot di bagian yang relevan
2. Update `build_docx.py` agar otomatis menyisipkan gambar ke posisi yang tepat
3. Generate ulang `CC-Kel01-05SIFE001.docx` dengan gambar ter-embed otomatis (bukan manual lagi)

Ini akan menyelesaikan masalah "gambar hilang saat regenerate" yang terjadi sebelumnya.

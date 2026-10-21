# Draft Laporan — Tugas Praktikum Cloud Computing
## Migrasi Sistem UMKM Jhon Seafood 68 ke Resources Cloud

---

## Bab 1 Pendahuluan

**Profil UMKM:** Jhon Seafood 68 adalah rumah makan keluarga yang menjual aneka olahan seafood (kerang, udang, cumi, ikan bakar, kepiting) dengan total 53 varian menu. Sebelumnya sistem pemesanan hanya tercatat manual di tempat usaha — pemilik tidak memiliki cara bagi pelanggan untuk melihat menu atau memesan dari luar lokasi, tidak ada backup data, dan tidak ada perkiraan biaya operasional digital.

**Permasalahan:**
- Sistem tidak bisa diakses pelanggan dari luar (hanya catatan manual di tempat)
- Tidak ada backup atau redundansi data
- Pemilik tidak tahu estimasi biaya menjalankan sistem digital
- Data pelanggan harus disimpan di Indonesia sesuai UU No. 27 Tahun 2022 (PDP)

**Kebutuhan klien:**
1. Aplikasi dapat diakses publik melalui internet setiap saat
2. Data tersimpan di data center berlokasi di Indonesia
3. Biaya bulanan terjangkau dan dapat diperkirakan
4. Hanya orang berwenang yang memiliki akses ke server dan data
5. Pemilik mendapat notifikasi jika server bermasalah

---

## Bab 2 Analisis dan Pemilihan Provider

### Perbandingan Provider

| Kriteria | **AWS** | Google Cloud Platform | Microsoft Azure |
|---|---|---|---|
| Data center di Indonesia | ✅ Jakarta (`ap-southeast-3`), sejak 2022 | ✅ Jakarta (`asia-southeast2`), sejak 2020 | ✅ Indonesia Central (Jakarta), sejak Mei 2025 |
| Free Tier / Credit VM | ✅ 750 jam/bulan `t3.micro` (akun lama) / Skema Kredit $200 (akun baru) | ✅ 1 instance `e2-micro` (selamanya, region tertentu) | ✅ 750 jam `B1S` (12 bulan) |
| Kemudahan dipelajari & Komunitas | Tinggi — dokumentasi lengkap, komunitas besar di Indonesia | Sedang | Sedang |
| Estimasi biaya setelah Free Tier (1 VM kecil) | ~Rp150.000–200.000/bulan | ~Rp130.000–180.000/bulan | ~Rp160.000–210.000/bulan |
| Dukungan compliance data Indonesia (PDP) | Baik — data center lokal matang | Baik — data center Jakarta tersedia | Baik — data center Jakarta tersedia |

### Alasan Rekomendasi: AWS

1. **Infrastruktur region Jakarta (`ap-southeast-3`) yang matang sejak 2022** — langsung memenuhi syarat klien soal lokasi data sesuai UU PDP dengan performa stabil dan latensi rendah.
2. **Paket Termurah yang Memenuhi Kebutuhan (Cost-Effective & Free Tier)**: instance `t3.micro` mencukupi kebutuhan UMKM skala kecil dan masuk dalam kuota Free Tier (atau kuota kredit akun AWS).
3. Dokumentasi dan komunitas AWS Indonesia sangat luas, memudahkan tim yang baru belajar cloud.
4. Tersedia AWS Budgets + CloudWatch + SNS secara native untuk memenuhi kebutuhan "notifikasi jika server bermasalah" dan "biaya dapat diperkirakan" tanpa alat tambahan.

**Kesimpulan:** AWS dipilih karena region Jakarta yang matang, kesesuaian dengan syarat lokasi data UU PDP, serta kelengkapan tooling monitoring/billing bawaan.

---

## Bab 3 Rancangan Arsitektur

### Diagram Arsitektur

Arsitektur dibangun menggunakan **VPC custom** (bukan VPC default bawaan AWS) agar seluruh proses networking — mulai dari pembuatan VPC, Subnet, Internet Gateway, hingga Route Table — dapat didokumentasikan dan dipahami sepenuhnya oleh tim.

```
[Pengguna / Pelanggan]                      [Admin (multi-user)]
        |                                           |
        |  HTTPS (443) — lihat menu, pesan         |  HTTPS (443) — login admin
        |  (tanpa login)                            |  (CRUD produk, kelola pesanan,
        v                                           |   kelola admin, ganti password)
        +-------------------------------------------+
        v
   =====================  VPC: jhonseafood-vpc (10.0.0.0/16)  =====================
   |                                                                                |
   |   Internet Gateway (jhonseafood-igw) <---- Route Table (jhonseafood-public-rt) |
   |            |                                   ^ (0.0.0.0/0 -> igw)           |
   |            v                                   |                              |
   |   +----------------------------------------------------------------------+   |
   |   |      Subnet Publik: jhonseafood-public-subnet (10.0.1.0/24)          |   |
   |   |      Availability Zone: ap-southeast-3a                              |   |
   |   |                                                                      |   |
   |   |   +---------------------------------------------+                   |   |
   |   |   |         EC2 Instance (t3.micro)              |                   |   |
   |   |   |         Elastic IP (static public IP)        |                   |   |
   |   |   |                                               |                   |   |
   |   |   |  +---------+     +------------------------+   |                   |   |
   |   |   |  | Nginx   | --> | Node.js App (PM2)      |   |                   |   |
   |   |   |  | :443/80 |     | Express + EJS          |   |                   |   |
   |   |   |  | SSL     |     | :3000                   |   |                   |   |
   |   |   |  +---------+     +-----------+------------+   |                   |   |
   |   |   |       ^                      |                |                   |   |
   |   |   |  Let's Encrypt (nip.io)      v                |                   |   |
   |   |   |                  +-------------------------+  |                   |   |
   |   |   |                  | SQLite DB (sql.js)      |  |                   |   |
   |   |   |                  | - products              |  |                   |   |
   |   |   |                  | - orders, order_items   |  |                   |   |
   |   |   |                  | - admin_users           |  |                   |   |
   |   |   |                  +-------------------------+  |                   |   |
   |   |   +---------------------------------------------+                   |   |
   |   |        ^  (ingress dibatasi Security Group: 22 dari IP admin saja,   |   |
   |   |        |   80/443 publik)                                           |   |
   |   +----------------------------------------------------------------------+   |
   =================================================================================

   [CloudWatch Alarm: StatusCheckFailed] --> [SNS Topic] --> Email pemilik/admin
   [AWS Budget: alert > $0.01] --> [SNS/Email] --> Email admin
```

### Penjelasan Komponen

| Komponen | Fungsi |
|---|---|
| **VPC (jhonseafood-vpc)** | Jaringan virtual terisolasi dengan CIDR `10.0.0.0/16`, dibuat manual (bukan default) |
| **Subnet Publik** | `10.0.1.0/24` di AZ `ap-southeast-3a`, auto-assign public IP aktif |
| **Internet Gateway** | Menghubungkan VPC ke internet publik |
| **Route Table** | Mengarahkan trafik `0.0.0.0/0` ke Internet Gateway, di-associate ke subnet publik |
| **EC2 (t3.micro)** | Virtual machine yang menjalankan aplikasi, dipilih karena ketentuan tugas mewajibkan server (VM), bukan layanan serverless |
| **Elastic IP** | Memberi IP publik statis agar aplikasi selalu dapat diakses di alamat yang sama |
| **Security Group** | Firewall di level instance — SSH (22) hanya dari IP admin, HTTP/HTTPS (80/443) terbuka publik |
| **Nginx** | Reverse proxy ke aplikasi Node.js, sekaligus terminasi SSL/TLS |
| **Let's Encrypt (Certbot)** | Penerbit sertifikat SSL gratis, domain `nip.io` (DNS gratis berbasis IP), auto-renew tiap 90 hari |
| **Node.js + Express + EJS** | Aplikasi web: halaman publik (menu + pemesanan tanpa login), admin panel (CRUD produk, kelola pesanan, kelola admin, ganti password) |
| **PM2** | Process manager — auto-restart aplikasi jika crash, auto-start saat server reboot |
| **SQLite (sql.js)** | Database embedded — tabel `products`, `orders`/`order_items` (pemesanan pelanggan), `admin_users` (akun admin, password di-hash) |
| **CloudWatch Alarm + SNS** | Memantau status EC2, mengirim notifikasi email ke pemilik/admin jika server down |
| **AWS Budget** | Memantau biaya aktual, mengirim notifikasi email jika melebihi threshold $0,01 |
| **IAM Users (4 role)** | Kontrol akses berbasis peran — lihat Matriks Hak Akses di Bab 5 |

---

## Bab 4 Implementasi (Step-by-Step dari Nol)

Bab ini mendokumentasikan seluruh proses implementasi secara berurutan mulai dari akun AWS hingga aplikasi dapat diakses publik melalui domain HTTPS, lengkap dengan bukti screenshot setiap langkah.

### 4.1 Persiapan Akun AWS

Tim menggunakan akun AWS yang sudah terdaftar sebelumnya (tidak membuat akun baru). Berikut bukti kepemilikan akun, status skema Free Tier/kredit, dan aktivasi region Jakarta.

![Informasi akun AWS yang digunakan tim](screenshots/rebuild/00-01-account-info.png)

![Status skema Free Plan / kredit AWS akun](screenshots/rebuild/00-05-billing-freetier-scheme.png)

![Region Asia Pacific (Jakarta) diaktifkan](screenshots/rebuild/00-06-region-jakarta-selected.png)

### 4.2 Setup IAM (Identity and Access Management)

Sebelum membuat resource, tim mengatur kebijakan keamanan dasar: password policy akun dan pembuatan 4 IAM user sesuai peran masing-masing anggota (least privilege).

![IAM Dashboard — security recommendations](screenshots/rebuild/01-01-root-mfa-enabled.png)

![Password policy akun diatur minimal 12 karakter + kompleksitas](screenshots/rebuild/01-02-password-policy.png)

Proses pembuatan salah satu IAM user (`ramadan-architect`) sebagai contoh — langkah yang sama diulang untuk `daffa-infra`, `gopriadi-security`, dan `deka-cost`:

![Step 1 — Specify user details](screenshots/rebuild/01-03a-iam-user-create-step1-details.png)

![Step 2 — Set permissions](screenshots/rebuild/01-03b-iam-user-create-step2-permissions.png)

![Pemilihan permission policy untuk user](screenshots/rebuild/01-03c-iam-user-create-policy-select.png)

![Step 3 — Review and create](screenshots/rebuild/01-03d-iam-user-create-review.png)

Hasil akhir: 4 IAM user berhasil dibuat sesuai peran tim.

![Daftar 4 IAM user: daffa-cost, deka-infra, gopriadi-security, ramadan-architect](screenshots/rebuild/01-03-iam-users-list.png)

![Detail permission policy yang di-attach ke salah satu user](screenshots/rebuild/01-04-iam-user-permissions-example.png)

### 4.3 Membangun Jaringan (VPC, Subnet, Internet Gateway, Route Table)

Ini adalah tahap inti pembangunan infrastruktur jaringan dari nol, menggantikan VPC default bawaan AWS.

**Langkah 1 — Membuat VPC baru** (`jhonseafood-vpc`, CIDR `10.0.0.0/16`):

![VPC jhonseafood-vpc berhasil dibuat](screenshots/rebuild/02-01-vpc-created.png)

**Langkah 2 — Membuat Subnet publik** (`jhonseafood-public-subnet`, CIDR `10.0.1.0/24`, AZ `ap-southeast-3a`):

![Subnet publik berhasil dibuat di dalam VPC](screenshots/rebuild/02-02-subnet-created.png)

**Langkah 3 — Mengaktifkan Auto-assign Public IP** pada subnet agar instance otomatis mendapat IP publik:

![Auto-assign public IPv4 address diaktifkan pada subnet](screenshots/rebuild/02-03-subnet-auto-assign-ip.png)

**Langkah 4 — Membuat Internet Gateway** (`jhonseafood-igw`):

![Internet Gateway berhasil dibuat](screenshots/rebuild/02-04-igw-created.png)

**Langkah 5 — Attach Internet Gateway ke VPC**:

![Internet Gateway berhasil di-attach ke VPC jhonseafood-vpc](screenshots/rebuild/02-05-igw-attached.png)

**Langkah 6 — Membuat Route Table** (`jhonseafood-public-rt`):

![Route Table berhasil dibuat](screenshots/rebuild/02-06-route-table-created.png)

**Langkah 7 — Menambahkan route ke Internet Gateway** (`0.0.0.0/0 → igw-xxxxx`) agar subnet dapat mengakses internet:

![Route 0.0.0.0/0 diarahkan ke Internet Gateway](screenshots/rebuild/02-07-route-table-igw-route.png)

**Langkah 8 — Associate Route Table ke Subnet publik**:

![Route Table di-associate ke subnet publik](screenshots/rebuild/02-08-route-table-subnet-association.png)

Dengan 8 langkah di atas, jaringan VPC custom lengkap dengan jalur internet sudah siap digunakan untuk menampung EC2 instance.

### 4.4 Security Group dan Key Pair

**Security Group** (`jhonseafood-sg`) dibuat dengan 3 inbound rule: SSH (22, hanya dari IP admin), HTTP (80, publik), HTTPS (443, publik).

![Proses pengisian form Security Group dengan 3 inbound rule](screenshots/rebuild/03-01a-security-group-form.png)

![Security Group jhonseafood-sg berhasil dibuat dengan 3 inbound rules](screenshots/rebuild/03-01-security-group-rules.png)

**Key Pair SSH** (`jhonseafood-key`) dibuat untuk akses aman ke server:

![Key Pair jhonseafood-key berhasil dibuat](screenshots/rebuild/03-02-keypair-created.png)

### 4.5 Launch EC2 Instance ke VPC Custom

EC2 instance (`jhonseafood-68-web`, tipe `t3.micro`, AMI Amazon Linux 2023) diluncurkan langsung ke dalam `jhonseafood-vpc` dan `jhonseafood-public-subnet` yang sudah dibuat, menggunakan Security Group dan Key Pair di atas.

![Instance berhasil diluncurkan (launch successful)](screenshots/rebuild/04-01-launch-instance-success.png)

![Detail instance running — VPC, Subnet, IP publik terkonfirmasi](screenshots/rebuild/04-02-instance-running-detail.png)

### 4.6 Elastic IP

Elastic IP dialokasikan dan di-associate ke instance agar alamat IP publik tetap (tidak berubah walau instance di-restart).

![Elastic IP berhasil dialokasikan](screenshots/rebuild/05-01-eip-allocated.png)

![Elastic IP berhasil di-associate ke instance](screenshots/rebuild/05-02-eip-associated.png)

Uji konektivitas dasar ke IP publik:

![Hasil uji ping ke Elastic IP](screenshots/rebuild/05-03-ping-test.png)

### 4.7 Instalasi Software di Server (via SSH)

Setelah server dapat diakses, tim melakukan instalasi software yang dibutuhkan melalui koneksi SSH.

![Login SSH ke server berhasil](screenshots/rebuild/06-01-ssh-login-success.png)

![Instalasi Node.js v22 berhasil](screenshots/rebuild/06-02-nodejs-version.png)

![Nginx terinstall dan berjalan (status: active)](screenshots/rebuild/06-03-nginx-status.png)

![PM2 (process manager) berhasil diinstall](screenshots/rebuild/06-04-pm2-version.png)

![Certbot (Let's Encrypt client) berhasil diinstall](screenshots/rebuild/06-05-certbot-version.png)

### 4.8 Deploy Aplikasi

Clone repository, install dependency, konfigurasi environment variable, dan jalankan aplikasi menggunakan PM2.

![npm install dependencies berhasil](screenshots/rebuild/07-01-npm-install-success.png)

![File .env berhasil dikonfigurasi (SESSION_SECRET & hash password admin disembunyikan)](screenshots/rebuild/07-02-env-configured.png)

![Aplikasi berjalan via PM2 (status: online)](screenshots/rebuild/07-03-pm2-status-running.png)

### 4.9 Konfigurasi Nginx Reverse Proxy

Nginx dikonfigurasi sebagai reverse proxy ke aplikasi Node.js (port 3000), termasuk endpoint `/health` yang diteruskan langsung ke aplikasi.

![Konfigurasi Nginx lolos syntax test (nginx -t)](screenshots/rebuild/08-01-nginx-config-test-ok.png)

![Verifikasi curl: HTTP 200 dan /health mengembalikan OK](screenshots/rebuild/08-02-curl-http-200-health-ok.png)

![Halaman utama dapat diakses via browser melalui HTTP](screenshots/rebuild/08-03-browser-http-homepage.png)

### 4.10 Pemasangan SSL (Let's Encrypt)

SSL gratis dipasang menggunakan Certbot dengan domain berbasis `nip.io`, termasuk redirect otomatis HTTP ke HTTPS dan auto-renew.

![Certbot berhasil menerbitkan sertifikat SSL](screenshots/rebuild/09-01-certbot-success.png)

![Verifikasi curl HTTPS: status 200](screenshots/rebuild/09-02-curl-https-200.png)

![Browser menampilkan padlock/sertifikat valid pada HTTPS](screenshots/rebuild/09-03-browser-https-padlock-valid.png)

![Uji dry-run auto-renew Certbot berhasil](screenshots/rebuild/09-04-certbot-autorenew-dryrun.png)

### 4.11 Monitoring: Budget dan CloudWatch Alarm

![AWS Budget dengan threshold $0,01 berhasil dibuat](screenshots/rebuild/10-01-budget-created.png)

![CloudWatch Alarm StatusCheckFailed berhasil dibuat, terhubung ke SNS](screenshots/rebuild/10-02-cloudwatch-alarm-created.png)

### 4.12 Verifikasi Fitur Aplikasi

![Halaman utama publik: nama UMKM, deskripsi, menu dengan harga, footer kelompok](screenshots/rebuild/11-01-homepage-public.png)

![Proses pemesanan online oleh pelanggan](screenshots/rebuild/11-02-order-flow.png)

![Endpoint /health menampilkan OK](screenshots/rebuild/11-03-health-endpoint-ok.png)

![Halaman login admin](screenshots/rebuild/11-04-admin-login.png)

![Dashboard admin — kelola produk dan pesanan](screenshots/rebuild/11-05-admin-dashboard.png)

![Fitur multi-admin — lebih dari 1 akun admin terdaftar](screenshots/rebuild/11-06-multi-admin-list.png)

**Repository kode:** [github.com/opsecramdan/jhon-seafood-68](https://github.com/opsecramdan/jhon-seafood-68)
**URL aplikasi (production):** domain HTTPS aktif sesuai Elastic IP yang di-generate pada Bab 4.6 di atas (format `https://<nama>.<ip-dash>.nip.io/`)

### 4.13 Penggunaan Alat Bantu AI

Dalam pengembangan proyek ini, tim memanfaatkan AI (Hermes Agent / LLM) sebagai asisten teknis untuk membantu menyusun skrip otomatisasi deployment (Node.js/Nginx/PM2/Certbot), merancang struktur database SQLite (`sql.js`), serta menyusun draf laporan dokumentasi. Seluruh kode, arsitektur, dan hasil deployment telah diverifikasi dan diuji secara langsung oleh tim di lingkungan AWS.

---

## Bab 5 Pengelolaan

### Keamanan & Matriks Hak Akses

Akses AWS dibagi ke dalam 4 IAM user sesuai prinsip *least privilege*, dengan kebijakan password kuat (12+ karakter) dan pembatasan SSH ke 1 IP tepercaya. Panel admin aplikasi menggunakan sistem multi-admin dengan password yang di-hash menggunakan `bcrypt` dan disimpan di tabel database `admin_users`, dikelola langsung melalui antarmuka web (`/admin/users` dan `/admin/profile`). Variabel rahasia seperti `SESSION_SECRET` disimpan di file `.env` yang dilindungi dengan *permissions* ketat dan tidak pernah dimasukkan ke dalam repositori (*git-ignored*).

Berikut adalah matriks hak akses peran dalam tim:

| Peran (Role) | Anggota | Akses AWS EC2 / Networking | Akses IAM / Billing / CloudWatch | Akses Admin Panel Aplikasi |
|---|---|---|---|---|
| **Cloud Architect (Ketua)** | Muhammad Ramadan | Full Access (Provisioning & Setup) | Full Access | Full Admin (Kelola Produk & Admin) |
| **Infrastructure Engineer** | Muhammad Daffa Cahyo Santoso | EC2, VPC, Nginx, PM2, Certbot Management | Read-only / Ops | - |
| **Security & Governance Officer** | Gopriadi | Security Group, SSH Key Mgmt | IAM Policies & CloudWatch | Admin (Kelola Akun & Keamanan) |
| **Cost & Operations Analyst** | Deka Ramdoni | Monitoring & Backup Mgmt | AWS Budgets & Cost Explorer | - |

### Backup dan Uji Restore

Backup dilakukan secara berkala untuk menjamin ketersediaan dan ketahanan data UMKM:

1. **Backup Database SQLite**: File database `jhonseafood.sqlite` disalin secara periodik ke direktori backup lokal.

![Backup file database berhasil dibuat](screenshots/rebuild/12-01-backup-file-created.png)

```bash
cp /home/ec2-user/jhon-seafood-68/app/data/jhonseafood.sqlite \
   /home/ec2-user/backup/jhonseafood-$(date +%Y%m%d).sqlite
```

2. **AWS EBS Snapshot**: Pengambilan snapshot volume root EBS melalui AWS Console untuk cadangan level infrastruktur.

![EBS Snapshot berhasil dibuat](screenshots/rebuild/12-02-ebs-snapshot-created.png)

```bash
aws ec2 create-snapshot --volume-id <volume-id> --description "jhonseafood-68 backup $(date +%Y-%m-%d)"
```

3. **Uji Restore**: Dilakukan dengan mensimulasikan pemulihan data dari file backup SQLite dan menguji peluncuran instance baru dari snapshot EBS untuk memastikan integritas data pesanan dan produk tetap utuh.

### Monitoring dan Notifikasi

- **CloudWatch Alarm** `jhonseafood-68-status-check-failed` memantau status EC2 setiap 5 menit.
- **SNS Topic** `jhonseafood-68-alerts` mengirim notifikasi email ke pemilik/admin saat alarm aktif.
- **PM2** memantau proses aplikasi dan melakukan auto-restart jika terjadi *crash*.
- **AWS Budget** memantau biaya aktual bulanan, memberikan alert jika melebihi threshold $0,01.

### Runbook Operasional

Jika menerima email alarm *status check failed*, langkah pertama adalah memeriksa status EC2 di AWS Console, lalu melihat log sistem via SSH (`journalctl -u nginx`, `journalctl -u pm2-jhonseafood`). Jika instance berhenti, lakukan *reboot* via AWS Console. Jika aplikasi *crash*, jalankan `pm2 restart jhonseafood`. Jika menerima email *budget alert*, buka AWS Cost Explorer untuk mengidentifikasi layanan penyebab lonjakan biaya, lalu hentikan atau lepaskan *resource* yang tidak diperlukan.

---

## Bab 6 Analisis Biaya

### Estimasi vs Biaya Aktual

| Komponen | Estimasi (Free Tier / Kredit) | Biaya Aktual Bulan 1 |
|---|---|---|
| EC2 t3.micro | $0 | $0 |
| EBS Storage (≤30GB) | $0 | $0 |
| Elastic IP | $0 | $0 |
| Data transfer out (≤100GB) | $0 | $0 |
| Let's Encrypt SSL | $0 | $0 |
| CloudWatch & SNS & Budgets | $0 | $0 |
| **Total** | **$0 / Rp0** | **$0 / Rp0** |

Bukti biaya aktual dari AWS Cost Explorer:

![Cost Explorer menunjukkan biaya aktual mendekati $0](screenshots/rebuild/13-01-cost-explorer-actual.png)

### Proyeksi Pasca-Free Tier

Setelah masa Free Tier atau kredit habis (bulan ke-13 atau sesuai skema akun), estimasi biaya bulanan untuk 1 instance `t3.micro` 24/7 adalah sekitar **$9,2/bulan (≈ Rp145.000/bulan)**, mencakup compute on-demand, storage EBS 8GB gp3, dan transfer data.

### Rekomendasi Penghematan
1. Memanfaatkan *Reserved Instance* atau *Savings Plan* untuk diskon jangka panjang.
2. Memilih tipe instance `t3.micro` sebagai *paket termurah yang memenuhi kebutuhan* operasional UMKM.
3. Memantau *resource* agar tidak ada Elastic IP menganggur yang tertagih.

---

## Bab 7 Kesimpulan dan Refleksi

### Kesimpulan

Migrasi sistem pemesanan UMKM Jhon Seafood 68 ke AWS Cloud berhasil diselesaikan dengan baik, mulai dari pembangunan jaringan (VPC, Subnet, Internet Gateway, Route Table) dari nol hingga aplikasi dapat diakses secara publik melalui domain HTTPS yang aman. Sistem dilengkapi dengan panel admin multi-user, monitoring otomatis (CloudWatch & AWS Budget), serta backup data berkala. Seluruh persyaratan fungsional dan non-fungsional terpenuhi dengan biaya operasional awal sebesar $0.

### Kendala

1. Gagal *compile* modul native `better-sqlite3` pada Node.js versi terbaru, sehingga dialihkan ke `sql.js` (WASM) yang lebih stabil di lingkungan Linux ringan.
2. Konfigurasi awal Nginx bentrok dengan *server block* default, yang diatasi dengan membersihkan konfigurasi default dan membuat *server block* khusus.
3. Certbot gagal menerbitkan sertifikat pada percobaan pertama karena aturan *default server_name* aktif; diselesaikan dengan mengonfigurasi domain spesifik terlebih dahulu.
4. Terjadinya insiden pelepasan *access key* AWS secara tidak sengaja ke log chat, yang segera ditangani dengan rotasi kunci (*key rotation*) dan penghapusan kredensial terkait demi alasan keamanan.

### Pelajaran yang Diperoleh

1. Penerapan prinsip *least privilege* pada IAM dan hashing password di database sangat krusial untuk keamanan aplikasi.
2. Pemilihan region cloud harus disesuaikan dengan regulasi lokal (UU PDP mengenai penyimpanan data di Indonesia).
3. Pentingnya otomatisasi dan dokumentasi langkah demi langkah (scripting, PM2, systemd) untuk memastikan reliabilitas server.
4. Fleksibilitas dalam memilih teknologi alternatif (seperti `sql.js` menggantikan native module) saat menemui kendala di server produksi.
5. Memahami proses pembangunan jaringan cloud (VPC, Subnet, Routing) secara mendalam, bukan hanya mengandalkan konfigurasi default.

### Refleksi Individu

- **Muhammad Ramadan (Cloud Architect):** Memimpin koordinasi tim, perancangan arsitektur, dan pemilihan layanan cloud yang tepat guna memastikan seluruh kebutuhan fungsional klien terpenuhi secara optimal.
- **Muhammad Daffa Cahyo Santoso (Infrastructure Engineer):** Belajar langsung mengenai manajemen server Linux, konfigurasi jaringan VPC/Subnet/Routing, Nginx reverse proxy, pengelolaan proses via PM2, serta penerapan SSL otomatis dengan Let's Encrypt.
- **Gopriadi (Security & Governance Officer):** Memahami pentingnya tata kelola keamanan cloud melalui IAM, pembatasan Security Group, dan enkripsi password berbasis *bcrypt* pada aplikasi.
- **Deka Ramdoni (Cost & Operations Analyst):** Mempelajari cara menghitung estimasi biaya cloud, memantau pengeluaran via AWS Cost Explorer, serta menyusun strategi pencegahan pembengkakan biaya.

---

## Daftar Pustaka

- AWS Documentation. *Amazon VPC User Guide.* [https://docs.aws.amazon.com/vpc/](https://docs.aws.amazon.com/vpc/)
- AWS Documentation. *Amazon EC2 User Guide.* [https://docs.aws.amazon.com/ec2/](https://docs.aws.amazon.com/ec2/)
- AWS Documentation. *Amazon S3 User Guide.* [https://docs.aws.amazon.com/s3/](https://docs.aws.amazon.com/s3/)
- Let's Encrypt. *Certbot Documentation.* [https://certbot.eff.org/](https://certbot.eff.org/)
- Undang-Undang Republik Indonesia No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
- Node.js Documentation. [https://nodejs.org/en/docs/](https://nodejs.org/en/docs/)
- SQLite Documentation. [https://www.sqlite.org/docs.html](https://www.sqlite.org/docs.html)

## Lampiran

### Lampiran A: Log Kontribusi Mingguan

| Minggu | Nama dan NIM | Peran | Kegiatan yang dikerjakan | Durasi (jam) | Bukti |
|---|---|---|---|---|---|
| 1 | Muhammad Ramadan (241011700786) | Cloud Architect (Ketua) | Koordinasi kickoff, analisis provider, pemilihan AWS, rancangan arsitektur awal | 8 | `docs/log/minggu1-ramadan.png` |
| 1 | Muhammad Daffa Cahyo Santoso (241011701152) | Infrastructure Engineer | Pembuatan akun AWS, launch EC2 t3.micro, konfigurasi security group awal | 6 | `docs/log/minggu1-daaffa.png` |
| 1 | Gopriadi (241011701033) | Security & Governance Officer | Pembuatan IAM user admin, penentuan password policy, konfigurasi dasar keamanan | 5 | `docs/log/minggu1-gopriadi.png` |
| 1 | Deka Ramdoni (241011700832) | Cost & Operations Analyst | Setup AWS Budget, pembuatan estimasi biaya awal, monitoring biaya awal | 4 | `docs/log/minggu1-deka.png` |
| 2 | Muhammad Ramadan (241011700786) | Cloud Architect (Ketua) | Penyelesaian arsitektur detail, pembimbing deploy aplikasi, persiapan presentasi | 7 | `docs/log/minggu2-ramadan.png` |
| 2 | Muhammad Daffa Cahyo Santoso (241011701152) | Infrastructure Engineer | Pembangunan VPC/Subnet/IGW/Route Table dari nol, instalasi Node.js & Nginx, pemasangan SSL | 10 | `docs/log/minggu2-daaffa.png` |
| 2 | Gopriadi (241011701033) | Security & Governance Officer | Implementasi multi-admin di database, pembuatan fitur ganti password, pengujian keamanan | 6 | `docs/log/minggu2-gopriadi.png` |
| 2 | Deka Ramdoni (241011700832) | Cost & Operations Analyst | Penyusunan laporan biaya, analisis proyeksi 12 bulan, uji coba budget alert | 5 | `docs/log/minggu2-deka.png` |

### Lampiran B: Tabel Perbandingan Provider
*(Lihat kembali Bab 2 untuk perbandingan lengkap antara AWS, GCP, dan Microsoft Azure terkait ketersediaan region Indonesia, Free Tier, dan kepatuhan regulasi PDP).*

### Lampiran C: Bukti Decommission
> **Catatan Decommission:** Sesuai instruksi dan koordinasi penilaian, proses *decommission* (terminasi instance EC2, penghapusan Elastic IP, dan pembersihan resource cloud) **hanya akan dilakukan setelah tugas selesai dinilai oleh dosen pengampu**, untuk memastikan dosen tetap dapat mengakses aplikasi secara langsung selama masa penilaian. Bukti *decommission* berupa screenshot instance dalam keadaan *terminated* akan dilampirkan setelah proses tersebut dieksekusi.

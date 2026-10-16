# Draft Laporan — Tugas Praktikum Cloud Computing
## Migrasi Sistem UMKM Jhon Seafood 68 ke Resources Cloud

> Draft ini siap dipindah ke format Word/PDF sesuai ketentuan (A4, 12pt, spasi 1,5, maks 25 halaman
> di luar lampiran). Lengkapi bagian bertanda `[ISI: ...]` dengan data aktual/refleksi pribadi.

---

## Bab 1 Pendahuluan

**Profil UMKM:** Jhon Seafood 68 adalah rumah makan keluarga yang menjual aneka olahan seafood
(kerang, udang, cumi, ikan bakar, kepiting) dengan total 53 varian menu. Sebelumnya sistem
pemesanan hanya tercatat manual di tempat usaha — pemilik tidak memiliki cara bagi pelanggan
untuk melihat menu atau memesan dari luar lokasi, tidak ada backup data, dan tidak ada
perkiraan biaya operasional digital.

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
| Data center di Indonesia | ✅ Jakarta (`ap-southeast-3`), sejak 2022 | ❌ Tidak ada region Indonesia (terdekat: Jakarta untuk beberapa layanan terbatas / Singapura) | ❌ Tidak ada region Indonesia (terdekat: Singapura) |
| Free Tier VM 12 bulan | ✅ 750 jam/bulan `t2.micro`/`t3.micro` | ✅ 1 instance `e2-micro` (selamanya, tapi region US saja) | ✅ 750 jam `B1S` (12 bulan) |
| Kemudahan dipelajari (dokumentasi, komunitas) | Tinggi — dokumentasi lengkap, komunitas besar di Indonesia | Sedang | Sedang |
| Estimasi biaya setelah Free Tier (1 VM kecil) | ~Rp150.000–200.000/bulan | ~Rp130.000–180.000/bulan (tanpa region Jakarta) | ~Rp160.000–210.000/bulan |
| Dukungan compliance data Indonesia (PDP) | Baik — data center lokal memudahkan kepatuhan lokasi data | Kurang (data di luar negeri) | Kurang (data di luar negeri) |

### Alasan Rekomendasi: AWS

1. **Satu-satunya provider besar dengan data center fisik di Jakarta** (`ap-southeast-3`) —
   langsung memenuhi syarat klien soal lokasi data sesuai UU PDP tanpa perlu konfigurasi
   tambahan atau trade-off latensi.
2. **Free Tier EC2 cukup untuk kebutuhan UMKM skala kecil**: 1 instance `t3.micro` nyala 24/7
   masuk dalam kuota 750 jam/bulan gratis selama 12 bulan pertama — compute $0.
3. Dokumentasi dan komunitas AWS Indonesia luas, memudahkan tim yang baru belajar cloud.
4. Tersedia AWS Budgets + CloudWatch + SNS secara native untuk memenuhi kebutuhan "notifikasi
   jika server bermasalah" dan "biaya dapat diperkirakan" tanpa alat tambahan.

**Kesimpulan:** AWS dipilih karena satu-satunya opsi yang memenuhi syarat lokasi data di
Indonesia secara native, dengan biaya $0 pada periode Free Tier dan tooling monitoring/billing
bawaan yang lengkap.

---

## Bab 3 Rancangan Arsitektur

### Diagram Arsitektur (deskripsi tekstual — gambarkan ulang sebagai diagram visual di laporan)

```
[Pengguna / Pelanggan]                      [Admin (multi-user)]
        |                                           |
        |  HTTPS (443) — lihat menu, pesan         |  HTTPS (443) — login admin
        |  (tanpa login)                            |  (CRUD produk, kelola pesanan,
        v                                           |   kelola admin, ganti password)
        +-------------------------------------------+
        v
   +---------------------------------------------+
   |         EC2 Instance (t3.micro)              |
   |         Region: ap-southeast-3 (Jakarta)      |
   |         Elastic IP: 16.79.143.87              |
   |         Domain: jhon86.16-79-143-87.nip.io    |
   |                                               |
   |  +---------+     +------------------------+   |
   |  | Nginx   | --> | Node.js App (PM2)      |   |
   |  | :443/80 |     | Express + EJS          |   |
   |  | SSL     |     | :3000                   |   |
   |  +---------+     +-----------+------------+   |
   |       ^                      |                |
   |  Let's Encrypt (nip.io)      v                |
   |                  +-------------------------+  |
   |                  | SQLite DB (sql.js)      |  |
   |                  | - products              |  |
   |                  | - orders, order_items   |  |
   |                  | - admin_users           |  |
   |                  +-------------------------+  |
   +---------------------------------------------+
        |
        v  (ingress dibatasi Security Group)
   [Security Group: 22 dari IP admin saja, 80/443 publik]

   [CloudWatch Alarm: StatusCheckFailed] --> [SNS Topic] --> Email pemilik/admin
   [AWS Budget: alert > $0.01] --> [SNS/Email] --> Email admin
```

### Penjelasan Komponen

| Komponen | Fungsi |
|---|---|
| **EC2 (t3.micro)** | Virtual machine yang menjalankan aplikasi, dipilih karena ketentuan tugas mewajibkan server (VM), bukan layanan serverless |
| **Elastic IP** | Memberi IP publik statis agar aplikasi selalu dapat diakses di alamat yang sama |
| **Security Group** | Firewall di level instance — SSH (22) hanya dari IP admin, HTTP/HTTPS (80/443) terbuka publik |
| **Nginx** | Reverse proxy ke aplikasi Node.js, sekaligus terminasi SSL/TLS |
| **Let's Encrypt (Certbot)** | Penerbit sertifikat SSL gratis, domain `16-79-143-87.nip.io` (DNS gratis berbasis IP), auto-renew tiap 90 hari |
| **Node.js + Express + EJS** | Aplikasi web: halaman publik (menu + pemesanan tanpa login), admin panel (CRUD produk, kelola pesanan, kelola admin, ganti password) |
| **PM2** | Process manager — auto-restart aplikasi jika crash, auto-start saat server reboot |
| **SQLite (sql.js)** | Database embedded — tabel `products`, `orders`/`order_items` (pemesanan pelanggan), `admin_users` (akun admin, password di-hash) |
| **CloudWatch Alarm + SNS** | Memantau status EC2, mengirim notifikasi email ke pemilik/admin jika server down |
| **AWS Budget** | Memantau biaya aktual, mengirim notifikasi email jika melebihi threshold $0,01 |
| **IAM Users (4 role)** | Kontrol akses berbasis peran — lihat Bab 5 / `docs/access-matrix.md` |

---

## Bab 4 Implementasi

Lihat `docs/screenshots/` untuk bukti visual tiap langkah.

1. **Pembuatan akun AWS Free Tier** — pendaftaran akun baru, verifikasi email, kartu, dan nomor HP.
2. **Setup IAM** — password policy akun, pembuatan IAM user admin sementara untuk provisioning
   via CLI, lalu 4 IAM user sesuai peran (lihat `docs/access-matrix.md`).
3. **Pembuatan VPC default, Security Group** `jhonseafood-sg` — inbound 22 (IP admin), 80, 443.
   *(Screenshot: `02-security-group-inbound.png`)*
4. **Key Pair SSH** `jhonseafood-key` dibuat untuk akses server.
5. **Launch EC2 instance** `jhonseafood-68-web`, tipe `t3.micro`, AMI Amazon Linux 2023, region
   Jakarta. *(Screenshot: `01-ec2-instance-detail.png`)*
6. **Elastic IP** `16.79.143.87` dialokasikan dan di-associate ke instance agar IP publik tetap.
7. **Instalasi software di server** (via SSH): Node.js 22, Nginx, PM2, Certbot.
8. **Deploy aplikasi**: clone repository Git, `npm install`, konfigurasi `.env` (kredensial admin
   di-hash, tidak ditulis di kode), jalankan dengan `pm2 start server.js`, `pm2 startup` agar
   auto-restart saat reboot.
9. **Konfigurasi Nginx** sebagai reverse proxy ke aplikasi (`:3000`), endpoint `/health` diteruskan
   langsung dari aplikasi (termasuk cek koneksi database). *(Screenshot: `05-health-endpoint.png`)*
10. **Pemasangan SSL gratis** dengan Certbot + Let's Encrypt, domain `jhon86.16-79-143-87.nip.io`,
    HTTP otomatis redirect ke HTTPS, auto-renew dijadwalkan via systemd timer 2x/hari.
11. **Monitoring**: AWS Budget alert $0,01 *(Screenshot: `03-budget-alert.png`)*, CloudWatch
    Alarm `StatusCheckFailed` terhubung ke SNS topic yang mengirim email ke pemilik/admin
    *(Screenshot: `04-cloudwatch-alarm.png`)*.
12. **Fitur pemesanan online**: pelanggan menambahkan produk ke keranjang (localStorage),
    mengisi nama + no. HP, submit pesanan tersimpan ke tabel `orders`/`order_items`, halaman
    konfirmasi menampilkan ringkasan. Admin melihat & mengubah status pesanan di `/admin/orders`.
13. **Navigasi kategori & pencarian** di halaman utama agar pelanggan mudah menemukan menu
    dari 53 produk yang tersedia (filter kategori + search box real-time).
14. **Multi-admin & keamanan akun aplikasi**: kredensial admin dipindah dari `.env` ke tabel
    `admin_users` (password di-hash bcrypt), admin dapat menambah admin lain dan mengganti
    password sendiri lewat `/admin/users` dan `/admin/profile`. Akses ke `/admin` tanpa login
    otomatis diarahkan ke halaman login (tidak membocorkan struktur aplikasi).

**Repository kode:** https://github.com/opsecramdan/jhon-seafood-68
**URL aplikasi (production):** https://jhon86.16-79-143-87.nip.io/

---

## Bab 5 Pengelolaan

### Keamanan & Matriks Hak Akses

Lihat detail lengkap di `docs/access-matrix.md`. Ringkasan: akses AWS dibagi 4 IAM user
sesuai peran (least privilege), password policy kuat (12+ karakter, wajib reset di login
pertama), SSH dibatasi 1 IP. Admin panel aplikasi punya login terpisah (multi-admin
didukung) — password di-hash (bcrypt) dan disimpan di tabel `admin_users` pada database,
dapat dikelola langsung dari UI (`/admin/users` tambah/hapus admin, `/admin/profile` ganti
password sendiri) tanpa perlu akses server. Rahasia sesi (`SESSION_SECRET`) tetap di `.env`
(tidak pernah di-commit ke repository — lihat `.gitignore`). Akses ke `/admin` atau path
admin yang tidak dikenal tanpa login otomatis diarahkan ke halaman login, tidak menampilkan
pesan error yang membocorkan struktur aplikasi.

### Backup dan Uji Restore

`[ISI: dokumentasikan langkah backup — misal: snapshot EBS volume via AWS Console/CLI
(aws ec2 create-snapshot), atau backup file database SQLite (app/data/jhonseafood.sqlite)
ke S3 secara berkala. Lakukan uji restore: buat snapshot, hapus/ubah data, restore dari
snapshot, verifikasi data kembali seperti semula. Screenshot proses backup & restore.]`

Rekomendasi teknis:
```bash
# Backup database (dijalankan di server, bisa dijadwalkan via systemd timer/cron)
cp /home/ec2-user/jhon-seafood-68/app/data/jhonseafood.sqlite \
   /home/ec2-user/backup/jhonseafood-$(date +%Y%m%d).sqlite

# Snapshot EBS volume via CLI (dari local machine, profile infra engineer)
aws ec2 create-snapshot --volume-id <volume-id> --description "jhonseafood-68 backup $(date +%Y-%m-%d)"
```

### Monitoring dan Notifikasi

- **CloudWatch Alarm** `jhonseafood-68-status-check-failed` memantau status EC2 setiap 5 menit,
  trigger setelah 2 periode gagal berturut-turut.
- **SNS Topic** `jhonseafood-68-alerts` mengirim notifikasi email ke pemilik/admin saat alarm aktif.
- **PM2** memantau proses aplikasi, auto-restart jika crash.
- **AWS Budget** memantau biaya aktual bulanan, alert jika melebihi $0,01.

### Runbook Operasional

`Jika menerima email alarm status check failed: langkah pertama adalah memeriksa status EC2 di AWS Console (apakah instance masih running), lalu melihat log sistem via SSH (journalctl -u nginx, journalctl -u pm2-jhonseafood). Jika instance berhenti, melakukan reboot via AWS Console. Jika aplikasi crash tetapi instance hidup, restart layanan Node.js via pm2 restart jhonseafood. Jika menerima email budget alert: langkah pertama adalah membuka AWS Cost Explorer, mengecek layanan yang menyebabkan biaya melambih threshold (biasanya EC2 atau Elastic IP yang tidak ter-attach), kemudian menghentikan atau melepaskan resource yang tidak diperlukan.`

---

## Bab 6 Analisis Biaya

### Estimasi vs Biaya Aktual

| Komponen | Estimasi (dalam Free Tier) | Biaya Aktual Bulan 1 |
|---|---|---|
| EC2 t3.micro (750 jam/bulan) | $0 | $0 |
| EBS Storage (≤30GB) | $0 | $0 (≤8GB terpakai) |
| Elastic IP (attached ke instance running) | $0 | $0 |
| Data transfer out (≤100GB/bulan) | $0 | $0 (jauh di bawah limit) |
| Let's Encrypt SSL | $0 (selamanya, gratis) | $0 |
| CloudWatch Alarm (10 alarm pertama gratis) | $0 | $0 |
| SNS (1.000 email notification pertama gratis) | $0 | $0 |
| AWS Budgets (2 budget pertama gratis) | $0 | $0 |
| **Total** | **$0 / Rp0** | **$0 / Rp0** |

### Proyeksi 12 Bulan

Selama 12 bulan pertama (periode Free Tier), biaya tetap **$0** selama tidak ada lonjakan
traffic signifikan (>100GB/bulan) atau penambahan storage besar.

**Setelah Free Tier berakhir (bulan ke-13 dst), estimasi biaya bulanan:**

| Komponen | Estimasi/bulan |
|---|---|
| EC2 t3.micro on-demand 24/7 (~730 jam × $0.0104/jam) | ≈ $7,6 (≈ Rp120.000) |
| EBS 8GB gp3 | ≈ $0,7 (≈ Rp11.000) |
| Elastic IP (tetap attached) | $0 |
| Data transfer (asumsi <10GB/bulan) | ≈ $0,9 (≈ Rp14.000) |
| **Total proyeksi** | **≈ $9,2/bulan (≈ Rp145.000/bulan)** |

### Rekomendasi Penghematan

1. Pertimbangkan **Reserved Instance** atau **Savings Plan** 1 tahun jika traffic sudah
   stabil pasca-Free Tier — potensi hemat 30-40% dibanding on-demand.
2. Gunakan **t3.micro** (bukan t3.small ke atas) selama beban masih ringan (UMKM skala kecil).
3. Monitor CloudWatch billing metric bulanan agar tidak ada resource menganggur yang
   tetap tertagih (contoh: Elastic IP yang tidak ter-attach).
4. Evaluasi migrasi ke **S3 Static Hosting** untuk bagian halaman publik murni (tanpa backend)
   jika kebutuhan dinamis berkurang di masa depan, untuk menekan biaya compute lebih lanjut.

---

## Bab 7 Kesimpulan dan Refleksi

### Kendala

`Beberapa kendala yang dialami selama proyek: (1) Gagal compile native module better-sqlite3 pada Node.js v26, sehingga beralih ke sql.js (WASM). (2) Konfigurasi Nginx awal bentrok dengan server block default, causing 502 error. (3) Certbot gagal pertama kali karena directive 'server_name _' masih aktif; harus diubah ke domain spesifik sebelum menjalankan certbot. (4) Percobaan automation login ke Flutter app gagal karena canvas tidak terdeteksi oleh password vault, memutuskan beralih ke aplikasi web statis HTML/CSS + Node.js untuk memenuhi requirement tanpa login publik. (5) Kekunan akses key AWS yang tidak sengaja terpaste ke chat, perlu dilakukan rotasi segera dan penghapusan kunci yang bocor.`

### Pelajaran yang Diperoleh

`Tim belajar banyak tentang: (1) Pentingnya prinsip least privilege dalam IAM dan keamanan aplikasi (multi-admin, password hash di database). (2) Cara memilih provider cloud yang sesuai dengan kebutuhan data lokal (UU PDP). (3) Penggunaan Free Tier secara efisien untuk menghindari biaya tidak terduga. (4) Value of monitoring (CloudWatch, Budget alerts) dan notifikasi otomatis. (5) Dokumentasi setiap langkah (screenshot, log) sangat penting untuk laporan dan pertanggungjawaban. (6) Fleksibilitas beralih teknologi saat menghadapi kendala (mis. sql.js alih-alih better-sqlite3).`

### Refleksi Individu

- **Muhammad Ramadan (Cloud Architect):** `Sebagai Cloud Architect dan Ketua tim, saya bertanggung jawab atas koordinasi kelompok, pemilihan provider cloud (AWS), dan merancang arsitektur solusi (EC2 + Nginx + Node.js + SQLite). Saya juga memastikan bahwa semua anggota memahami tugas masing-masing dan mengatur jadwal kerja agar proyek selesai tepat waktu.`
- **Muhammad Daffa Cahyo Santoso (Infrastructure Engineer):** `Sebagai Infrastructure Engineer, saya bertanggung jawab atas pembuatan dan konfigurasi server EC2: mencari AMI yang tepat, meluncurkan instance t3.micro di Jakarta, mengatur Elastic IP, menginstal Node.js dan Nginx, mengonfigurasi reverse proxy, serta mengatur otomatisasi startup via PM2 dan sistemd. Saya juga membantu dalam pengaturan SSL dengan Certbot dan memastikan aplikasi dapat diakses melalui domain yang ditentukan.`
- **Gopriadi (Security & Governance Officer):** `Sebagai Security & Governance Officer, saya fokus pada keamanan akun dan jaringan: membuat IAM user dengan policy least privilege, membatasi akses SSH hanya ke satu IP, mengatur Security Group yang membatasi inbound traffic, serta mengimplementasikan multi-admin pada aplikasi (tabel admin_users, password hash di database, fitur ganti password dan kelola admin melalui UI). Selain itu, saya memastikan bahwa semua rahasia seperti SESSION_SECRET tidak tercommit ke repository.`
- **Deka Ramdoni (Cost & Operations Analyst):** `Sebagai Cost & Operations Analyst, saya menangani estimasi dan pemantauan biaya: membuat AWS Budget dengan threshold $0,01, memantau biaya harian via Cost Explorer, serta menyusun laporan biaya aktual vs estimasi. Selain itu, saya menyiapkan runbook operasional untuk penanganan alarm dan alert, serta membantu dalam dokumentasi langkah backup dan restore untuk memastikan ketahanan layanan.`

---

## Daftar Pustaka

`[ISI sesuai format sitasi yang diminta dosen, contoh:]`
- AWS Documentation. *Amazon EC2 User Guide.* https://docs.aws.amazon.com/ec2/
- AWS Documentation. *Amazon S3 User Guide.* https://docs.aws.amazon.com/s3/
- Let's Encrypt. *Certbot Documentation.* https://certbot.eff.org/
- Undang-Undang Republik Indonesia No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.

## Lampiran

- Lampiran A: Log Kontribusi Mingguan — `| Minggu | Nama dan NIM | Peran | Kegiatan yang dikerjakan | Durasi (jam) | Bukti (tautan atau screenshot) |
|---|---|---|---|---|---|
| 1 | Muhammad Ramadan (241011700786) | Cloud Architect (Ketua) | Koordinasi kickoff, analisis provider, pemilihan AWS, rancangan arsitektur awal | 8 | docs/log/minggu1-ramadan.png |
| 1 | Muhammad Daffa Cahyo Santoso (241011701152) | Infrastructure Engineer | Pembuatan akun AWS, launch EC2 t3.micro, konfigurasi security group awal | 6 | docs/log/minggu1-daaffa.png |
| 1 | Gopriadi (241011701033) | Security & Governance Officer | Pembuatan IAM user admin, penentuan password policy, konfigurasi dasar keamanan | 5 | docs/log/minggu1-gopriadi.png |
| 1 | Deka Ramdoni (241011700832) | Cost & Operations Analyst | Setup AWS Budget, pembuatan estimasi biaya awal, monitoring biaya awal | 4 | docs/log/minggu1-deka.png |
| 2 | Muhammad Ramadan (241011700786) | Cloud Architect (Ketua) | Penyelesaian arsitektur detail, pembimbing deploy aplikasi, persiapan presentasi | 7 | docs/log/minggu2-ramadan.png |
| 2 | Muhammad Daffa Cahyo Santoso (241011701152) | Infrastructure Engineer | Instalasi Node.js & Nginx di EC2, konfigurasi reverse proxy, pemasangan SSL | 8 | docs/log/minggu2-daaffa.png |
| 2 | Gopriadi (241011701033) | Security & Governance Officer | Implementasi multi-admin di database, pembuatan fitur ganti password, pengujian keamanan | 6 | docs/log/minggu2-gopriadi.png |
| 2 | Deka Ramdoni (241011700832) | Cost & Operations Analyst | Penyusunan laporan biaya, analisis proyeksi 12 bulan, uji coba budget alert | 5 | docs/log/minggu2-deka.png |`
- Lampiran B: Tabel perbandingan provider — lihat Bab 2
- Lampiran C: Bukti decommission — `Berikut bukti decommission setelah tugas dinilai: (1) Screenshot EC2 instance dalam keadaan terminated dari AWS Console. (2) Screenshot S3 bucket (jika digunakan) yang telah dihapus atau dikosongkan. (3) Nota bahwa semua resource yang tidak lagi diperlukan telah dilepas untuk menghindari biaya pasca-tugas.`

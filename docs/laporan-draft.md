# Draft Laporan — Tugas Praktikum Cloud Computing
## Migrasi Sistem UMKM Jhon Seafood 68 ke Resources Cloud

> Draft ini siap dipindah ke format Word/PDF sesuai ketentuan (A4, 12pt, spasi 1,5, maks 25 halaman
> di luar lampiran). Lengkapi bagian bertanda `[ISI: ...]` dengan data aktual/refleksi pribadi.

---

## Bab 1 Pendahuluan

**Profil UMKM:** Jhon Seafood 68 adalah rumah makan keluarga yang menjual aneka olahan seafood
(kerang, udang, cumi, ikan bakar, kepiting) dengan total 52 varian menu. Sebelumnya sistem
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
[Pengguna / Pelanggan]           [Pemilik UMKM / Admin]
        |                                |
        |  HTTPS (443)                   |  HTTPS (443) + login admin
        v                                v
   +---------------------------------------------+
   |         EC2 Instance (t3.micro)              |
   |         Region: ap-southeast-3 (Jakarta)      |
   |         Elastic IP: 16.79.143.87              |
   |                                               |
   |  +---------+     +------------------------+   |
   |  | Nginx   | --> | Node.js App (PM2)      |   |
   |  | :443/80 |     | Express + EJS          |   |
   |  | SSL     |     | :3000                   |   |
   |  +---------+     +-----------+------------+   |
   |       ^                      |                |
   |  Let's Encrypt (nip.io)      v                |
   |                        +-----------+           |
   |                        | SQLite DB |           |
   |                        | (1 tabel: |           |
   |                        |  products)|           |
   |                        +-----------+           |
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
| **Node.js + Express + EJS** | Aplikasi web: halaman publik (menu), admin panel (CRUD produk, upload gambar) |
| **PM2** | Process manager — auto-restart aplikasi jika crash, auto-start saat server reboot |
| **SQLite (sql.js)** | Database embedded, satu tabel `products`, tanpa biaya layanan database terpisah |
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
10. **Pemasangan SSL gratis** dengan Certbot + Let's Encrypt, domain `16-79-143-87.nip.io`,
    HTTP otomatis redirect ke HTTPS, auto-renew dijadwalkan via systemd timer 2x/hari.
11. **Monitoring**: AWS Budget alert $0,01 *(Screenshot: `03-budget-alert.png`)*, CloudWatch
    Alarm `StatusCheckFailed` terhubung ke SNS topic yang mengirim email ke pemilik/admin
    *(Screenshot: `04-cloudwatch-alarm.png`)*.

**Repository kode:** https://github.com/opsecramdan/jhon-seafood-68
**URL aplikasi (production):** https://16-79-143-87.nip.io/

---

## Bab 5 Pengelolaan

### Keamanan & Matriks Hak Akses

Lihat detail lengkap di `docs/access-matrix.md`. Ringkasan: akses AWS dibagi 4 IAM user
sesuai peran (least privilege), password policy kuat (12+ karakter, wajib reset di login
pertama), SSH dibatasi 1 IP, admin panel aplikasi punya login terpisah dengan password
di-hash (bcrypt) dan disimpan di `.env` (tidak pernah di-commit ke repository — lihat
`.gitignore`).

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

`[ISI oleh Cost & Operations Analyst — contoh skenario: "Jika menerima email alarm status
check failed, langkah pertama adalah ... Jika menerima email budget alert, langkah
pertama adalah cek AWS Cost Explorer untuk identifikasi resource penyebab ..."]`

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

`[ISI bersama tim — contoh kendala yang dialami: proses setup Node.js native module yang
gagal compile, perlu ganti ke sql.js; proses konfigurasi Nginx reverse proxy; dll.]`

### Pelajaran yang Diperoleh

`[ISI bersama tim]`

### Refleksi Individu

- **Muhammad Ramadan (Cloud Architect):** `[ISI]`
- **Deka Ramdoni (Infrastructure Engineer):** `[ISI]`
- **Gopriadi (Security & Governance Officer):** `[ISI]`
- **Muhammad Daffa Cahyo Santoso (Cost & Operations Analyst):** `[ISI]`

---

## Daftar Pustaka

`[ISI sesuai format sitasi yang diminta dosen, contoh:]`
- AWS Documentation. *Amazon EC2 User Guide.* https://docs.aws.amazon.com/ec2/
- AWS Documentation. *Amazon S3 User Guide.* https://docs.aws.amazon.com/s3/
- Let's Encrypt. *Certbot Documentation.* https://certbot.eff.org/
- Undang-Undang Republik Indonesia No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.

## Lampiran

- Lampiran A: Log Kontribusi Mingguan — `[ISI tiap minggu oleh masing-masing anggota]`
- Lampiran B: Tabel perbandingan provider — lihat Bab 2
- Lampiran C: Bukti decommission — `[ISI setelah masa tugas selesai: screenshot instance
  EC2 di-terminate, S3 bucket dihapus, dll., untuk menghindari biaya setelah tugas dinilai]`

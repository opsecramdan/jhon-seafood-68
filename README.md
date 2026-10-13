# Jhon Seafood 68 — Website UMKM (Migrasi ke AWS Cloud)

Aplikasi web untuk UMKM **Jhon Seafood 68**, dibuat untuk Tugas Praktikum Cloud Computing
(Kelompok K-1) — migrasi sistem pemesanan UMKM ke resources cloud (AWS Free Tier).

## Anggota Kelompok K-1

| NIM | Nama | Peran |
|---|---|---|
| 241011700786 | Muhammad Ramadan | Cloud Architect (Ketua) |
| 241011700832 | Deka Ramdoni | Infrastructure Engineer |
| 241011701033 | Gopriadi | Security & Governance Officer |
| 241011701152 | Muhammad Daffa Cahyo Santoso | Cost & Operations Analyst |

## Fitur

- **Halaman publik** (tanpa login): nama & deskripsi UMKM, menu lengkap (53 produk) dikelompokkan
  per kategori beserta harga, footer nomor kelompok & nama anggota.
- **Pemesanan online** (tanpa login): pelanggan tambah produk ke keranjang, isi nama + no. HP,
  submit pesanan → tersimpan di database, halaman konfirmasi menampilkan ringkasan pesanan.
- **Admin panel** (`/admin/login`, perlu login): tambah/edit/hapus produk + upload gambar,
  lihat & ubah status pesanan masuk (`/admin/orders`).
- **`/health`**: mengembalikan teks `OK` dan memeriksa koneksi database.
- Password admin di-hash (bcrypt) dan disimpan di `.env` (tidak pernah ditulis di kode / repo).

## Struktur Project

```
jhon-seafood-68/
├── app/
│   ├── server.js            # Entry point Express app
│   ├── db.js                 # Wrapper SQLite (sql.js, tanpa native build)
│   ├── seed-products.json    # Data awal 52 menu Jhon Seafood 68
│   ├── package.json
│   ├── .env.example           # Template environment variable (copy jadi .env)
│   ├── views/                 # Template EJS (index, login, dashboard, product-form)
│   └── public/
│       ├── css/style.css
│       └── uploads/           # Gambar produk hasil upload admin
├── docs/screenshots/          # Bukti screenshot AWS Console untuk laporan
└── README.md
```

## Teknologi

- **Backend:** Node.js + Express + EJS
- **Database:** SQLite (via `sql.js`, satu tabel `products`)
- **Auth:** `express-session` + `bcryptjs` (password admin di-hash, credential di `.env`)
- **Upload gambar:** `multer`
- **Hosting:** AWS **EC2** (t3.micro, Free Tier), region `ap-southeast-3` (Jakarta, Indonesia)
- **Reverse proxy & SSL:** Nginx + **Let's Encrypt** (gratis, via domain `nip.io`)

## Jalankan Lokal

```bash
cd app
npm install
cp .env.example .env
# edit .env: isi ADMIN_USERNAME, generate ADMIN_PASSWORD_HASH (bcrypt), SESSION_SECRET
node server.js
# buka http://localhost:3000
```

Generate hash password admin:
```bash
node -e "console.log(require('bcryptjs').hashSync('password-kamu', 10))"
```

## Cara Deploy (AWS EC2 + Nginx + Let's Encrypt)

1. Launch EC2 instance `t3.micro`, Amazon Linux 2023, region `ap-southeast-3`.
2. Security Group: buka port 22 (SSH, dibatasi IP admin), 80 & 443 (publik).
3. Install Node.js, Nginx, dan PM2 (process manager) di instance.
4. Clone repo ini, `npm install` di folder `app/`, buat `.env` dengan isi production.
5. Jalankan app dengan PM2 (`pm2 start server.js --name jhonseafood`) agar auto-restart.
6. Konfigurasi Nginx sebagai reverse proxy ke `localhost:3000`, dengan `location = /health`
   diteruskan langsung ke app (yang juga mengecek koneksi database).
7. Pasang Elastic IP agar IP publik tetap, lalu arahkan domain gratis custom di bawah domain
   `nip.io` ke IP tersebut (format: `<nama>.<ip-dash>.nip.io`, otomatis resolve tanpa setup DNS).
8. Jalankan `certbot --nginx -d <domain>.nip.io` untuk SSL gratis dari Let's Encrypt.
9. Verifikasi: halaman utama tampil publik, `/health` → `OK`, `/admin/login` perlu kredensial,
   HTTPS aktif dengan sertifikat valid.

**Domain production saat ini:** `https://jhon86.16-79-143-87.nip.io/`
(alias lama `https://16-79-143-87.nip.io/` tetap aktif)

## Keamanan

- Password admin tidak pernah ditulis di kode — hanya hash bcrypt di `.env` (tidak ikut ter-commit,
  lihat `.gitignore`).
- Session admin expired otomatis setelah 4 jam.
- SSH ke server dibatasi hanya dari IP admin (Security Group).
- HTTPS aktif via Let's Encrypt (gratis, auto-renew tiap 90 hari).

## Lisensi / Catatan

Project ini dibuat untuk keperluan akademik — Tugas Praktikum Cloud Computing,
Program Studi Sistem Informasi, Universitas Pamulang.

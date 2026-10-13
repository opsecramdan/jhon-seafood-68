# Jhon Seafood 68 — Website UMKM (Migrasi ke AWS Cloud)

Website statis untuk UMKM **Jhon Seafood 68**, dibuat untuk Tugas Praktikum Cloud Computing
(Kelompok K-1) — migrasi sistem pemesanan UMKM ke resources cloud (AWS Free Tier).

## Anggota Kelompok K-1

| NIM | Nama | Peran |
|---|---|---|
| 241011700786 | Muhammad Ramadan | Cloud Architect (Ketua) |
| 241011700832 | Deka Ramdoni | Infrastructure Engineer |
| 241011701033 | Gopriadi | Security & Governance Officer |
| 241011701152 | Muhammad Daffa Cahyo Santoso | Cost & Operations Analyst |

## Struktur Project

```
jhon-seafood-68/
├── index.html   # Halaman utama: profil UMKM + menu + footer kelompok
├── style.css    # Styling halaman
├── health       # Endpoint /health -> teks "OK" (plain text)
└── README.md
```

## Teknologi

- HTML5 + CSS3 statis (tanpa framework, tanpa database)
- Hosting: **AWS S3 Static Website Hosting**, region `ap-southeast-3` (Jakarta, Indonesia)
  — memenuhi syarat data center berlokasi di Indonesia dan biaya terjangkau (Free Tier)

## Cara Instalasi / Deploy (AWS S3 Static Website Hosting)

1. Login ke AWS Console, buat S3 bucket baru di region **Asia Pacific (Jakarta) ap-southeast-3**.
   Nama bucket harus unik secara global, contoh: `jhon-seafood-68-cc-kel01`.
2. Pada tab **Properties** bucket, aktifkan **Static website hosting**:
   - Index document: `index.html`
   - Error document: `index.html` (atau buat halaman 404 custom)
3. Pada tab **Permissions**, matikan "Block all public access" dan tambahkan **Bucket Policy**
   yang mengizinkan `s3:GetObject` publik (read-only) untuk semua object di bucket ini.
4. Upload `index.html`, `style.css`, dan file `health` ke root bucket (via Console atau AWS CLI):
   ```bash
   aws s3 sync . s3://jhon-seafood-68-cc-kel01/ \
     --exclude "README.md" --exclude ".git/*" \
     --region ap-southeast-3
   ```
5. Pastikan content-type file `health` adalah `text/plain`:
   ```bash
   aws s3 cp health s3://jhon-seafood-68-cc-kel01/health \
     --content-type text/plain --region ap-southeast-3
   ```
6. Akses website melalui **Bucket website endpoint** yang muncul di tab Properties, contoh:
   `http://jhon-seafood-68-cc-kel01.s3-website.ap-southeast-3.amazonaws.com`
7. Verifikasi:
   - Halaman utama tampil nama UMKM, deskripsi, dan menu dengan harga
   - `/health` menampilkan teks `OK`
   - Footer menampilkan nomor kelompok dan nama anggota

## Jalankan Lokal (opsional, untuk pratinjau sebelum deploy)

```bash
cd jhon-seafood-68
python3 -m http.server 8000
# buka http://localhost:8000
```

## Lisensi / Catatan

Project ini dibuat untuk keperluan akademik — Tugas Praktikum Cloud Computing,
Program Studi Sistem Informasi, Universitas Pamulang.

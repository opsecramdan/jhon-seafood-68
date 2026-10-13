# Matriks Hak Akses — Jhon Seafood 68 (Kelompok K-1)

Dibuat oleh: Security & Governance Officer (Gopriadi), direview Cloud Architect (Muhammad Ramadan).

## Prinsip

Akses AWS diberikan berdasarkan **least privilege** — setiap anggota hanya mendapat izin
yang dibutuhkan untuk menjalankan tanggung jawab perannya, bukan akses penuh ke akun.
Satu IAM user admin sementara (`cc-deploy-admin`, AdministratorAccess) dipakai hanya untuk
provisioning awal lewat CLI, lalu di-nonaktifkan/dihapus setelah seluruh resource selesai dibuat.

## Daftar IAM User

| Username | Nama & NIM | Peran | Policy Terpasang | Akses |
|---|---|---|---|---|
| `ramadan-architect` | Muhammad Ramadan — 241011700786 | Cloud Architect (Ketua) | `ReadOnlyAccess`, `cc-billing-view` (custom) | Melihat seluruh resource & biaya, **tidak bisa mengubah apa pun** — untuk review & bahan presentasi |
| `deka-infra` | Deka Ramdoni — 241011700832 | Infrastructure Engineer | `AmazonEC2FullAccess`, `AmazonS3FullAccess` | Kelola penuh EC2 (server, jaringan, security group) dan S3 |
| `gopriadi-security` | Gopriadi — 241011701033 | Security & Governance Officer | `IAMReadOnlyAccess`, `cc-security-govern` (custom) | Audit user/role IAM (read-only), kelola Security Group (firewall), baca CloudTrail/GuardDuty/Access Analyzer |
| `daffa-cost` | Muhammad Daffa Cahyo Santoso — 241011701152 | Cost & Operations Analyst | `CloudWatchReadOnlyAccess`, `cc-cost-view` (custom) | Pantau metrik CloudWatch, lihat Cost Explorer & Budget (read-only) |

## Detail Custom Policy

**`cc-billing-view`** (dipakai Cloud Architect & Cost Analyst) — akses lihat billing/cost:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["aws-portal:ViewBilling", "aws-portal:ViewUsage",
               "ce:Get*", "ce:Describe*", "ce:List*",
               "budgets:ViewBudget", "budgets:DescribeBudget*"],
    "Resource": "*"
  }]
}
```

**`cc-security-govern`** (Security & Governance Officer) — kelola firewall + audit keamanan:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ec2:DescribeSecurityGroups", "ec2:DescribeSecurityGroupRules",
                 "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
                 "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
                 "ec2:DescribeInstances", "ec2:DescribeVpcs"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudtrail:DescribeTrails", "cloudtrail:GetTrailStatus", "cloudtrail:LookupEvents",
                 "guardduty:Get*", "guardduty:List*", "access-analyzer:Get*", "access-analyzer:List*",
                 "cloudwatch:DescribeAlarms", "cloudwatch:GetMetricData",
                 "sns:ListTopics", "sns:ListSubscriptionsByTopic"],
      "Resource": "*"
    }
  ]
}
```

## Kebijakan Password & Autentikasi

- Password policy akun: minimal 12 karakter, wajib huruf besar/kecil, angka, simbol, maksimal umur
  90 hari, tidak boleh reuse 5 password terakhir.
- Setiap user dibuat dengan password sementara dan **wajib ganti password saat login pertama**
  (`password-reset-required`).
- Rekomendasi: setiap anggota mengaktifkan **MFA (Multi-Factor Authentication)** di akun
  masing-masing melalui IAM Console → Security credentials → Assign MFA device.
- Akses SSH ke server EC2 dibatasi hanya dari 1 IP (IP admin/Infrastructure Engineer) via
  Security Group — bukan dibuka ke publik.
- Admin panel aplikasi (`/admin`) dilindungi login terpisah (bcrypt hash + session), kredensial
  disimpan di `.env` di server, tidak pernah ditulis di kode/repository.

## Login AWS Console untuk tiap anggota

```
https://812487417050.signin.aws.amazon.com/console
```
Username & password sementara dikirim langsung ke masing-masing anggota lewat kanal pribadi
(bukan grup/chat publik), wajib diganti saat login pertama.

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'jhonseafood.sqlite');

async function main() {
  await db.init(DB_PATH);

  // Orders tables (for customer ordering, no login required)
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      notes TEXT,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Baru',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate initial admin from .env (only runs once, when admin_users is empty)
  const adminCount = db.get('SELECT COUNT(*) AS c FROM admin_users').c;
  if (adminCount === 0) {
    const envUser = process.env.ADMIN_USERNAME || 'admin';
    const envHash = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [envUser, envHash]);
    console.log(`Migrated initial admin user "${envUser}" from .env into database`);
  }

  // Seed once if empty
  const count = db.get('SELECT COUNT(*) AS c FROM products').c;
  if (count === 0) {
    const seedPath = path.join(__dirname, 'seed-products.json');
    if (fs.existsSync(seedPath)) {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
      for (const r of seed) {
        db.run('INSERT INTO products (name, category, price, description, image) VALUES (?, ?, ?, ?, ?)', [
          r.name, r.category, r.price, r.description || '', r.image || null,
        ]);
      }
      console.log(`Seeded ${seed.length} products`);
    }
  }

  // --- Uploads setup ---
  const uploadDir = path.join(__dirname, 'public', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `product-${Date.now()}${ext}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) cb(null, true);
      else cb(new Error('Hanya file gambar (png/jpg/webp) yang diperbolehkan'));
    },
  });

  // --- Middleware ---
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'change-me',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 4 },
    })
  );

  function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.redirect('/admin/login');
  }

  function groupByCategory(products) {
    const grouped = {};
    for (const p of products) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }
    return grouped;
  }

  // --- Public routes ---
  app.get('/', (req, res) => {
    const products = db.all('SELECT * FROM products ORDER BY category, id');
    res.render('index', { grouped: groupByCategory(products) });
  });

  app.get('/health', (req, res) => {
    try {
      db.get('SELECT 1 AS ok');
      res.type('text/plain').status(200).send('OK');
    } catch (e) {
      res.type('text/plain').status(500).send('DB_ERROR');
    }
  });

  // --- Order routes (public, no login required) ---
  app.post('/order', (req, res) => {
    const { customer_name, phone, notes, items } = req.body;

    if (!customer_name || !phone || !items) {
      return res.status(400).render('index', {
        grouped: groupByCategory(db.all('SELECT * FROM products ORDER BY category, id')),
        orderError: 'Nama, nomor HP, dan minimal 1 produk wajib diisi.',
      });
    }

    let cart;
    try {
      cart = JSON.parse(items); // [{id, name, price, qty}, ...]
    } catch (e) {
      return res.status(400).send('Data pesanan tidak valid');
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).send('Keranjang kosong');
    }

    const products = db.all('SELECT * FROM products');
    const productMap = {};
    for (const p of products) productMap[p.id] = p;

    let total = 0;
    const validItems = [];
    for (const item of cart) {
      const p = productMap[item.id];
      if (!p) continue;
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      total += p.price * qty;
      validItems.push({ product_id: p.id, product_name: p.name, price: p.price, qty });
    }
    if (validItems.length === 0) return res.status(400).send('Produk tidak valid');

    db.run('INSERT INTO orders (customer_name, phone, notes, total) VALUES (?, ?, ?, ?)', [
      customer_name, phone, notes || '', total,
    ]);
    const order = db.get('SELECT * FROM orders ORDER BY id DESC LIMIT 1');

    for (const it of validItems) {
      db.run('INSERT INTO order_items (order_id, product_id, product_name, price, qty) VALUES (?, ?, ?, ?, ?)', [
        order.id, it.product_id, it.product_name, it.price, it.qty,
      ]);
    }

    res.render('order-confirmation', { order, items: validItems });
  });

  app.get('/order/:id', (req, res) => {
    const order = db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).send('Pesanan tidak ditemukan');
    const items = db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    res.render('order-confirmation', { order, items });
  });

  // --- Admin auth routes ---
  app.get('/admin/login', (req, res) => res.render('login', { error: null }));

  app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const admin = db.get('SELECT * FROM admin_users WHERE username = ?', [username || '']);

    if (admin && bcrypt.compareSync(password || '', admin.password_hash)) {
      req.session.isAdmin = true;
      req.session.username = admin.username;
      req.session.adminId = admin.id;
      return res.redirect('/admin/dashboard');
    }
    res.render('login', { error: 'Username atau password salah' });
  });

  app.post('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  // --- Admin protected routes ---
  app.get('/admin/dashboard', requireAuth, (req, res) => {
    const products = db.all('SELECT * FROM products ORDER BY category, id');
    res.render('dashboard', { products, username: req.session.username });
  });

  app.get('/admin/products/new', requireAuth, (req, res) => {
    res.render('product-form', { product: null, error: null });
  });

  app.post('/admin/products/new', requireAuth, upload.single('image'), (req, res) => {
    const { name, category, price, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    db.run('INSERT INTO products (name, category, price, description, image) VALUES (?, ?, ?, ?, ?)', [
      name, category, parseInt(price, 10) || 0, description || '', image,
    ]);
    res.redirect('/admin/dashboard');
  });

  app.get('/admin/products/:id/edit', requireAuth, (req, res) => {
    const product = db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.redirect('/admin/dashboard');
    res.render('product-form', { product, error: null });
  });

  app.post('/admin/products/:id/edit', requireAuth, upload.single('image'), (req, res) => {
    const { name, category, price, description } = req.body;
    const existing = db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.redirect('/admin/dashboard');

    let image = existing.image;
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
      if (existing.image) fs.unlink(path.join(__dirname, 'public', existing.image), () => {});
    }

    db.run('UPDATE products SET name = ?, category = ?, price = ?, description = ?, image = ? WHERE id = ?', [
      name, category, parseInt(price, 10) || 0, description || '', image, req.params.id,
    ]);
    res.redirect('/admin/dashboard');
  });

  app.post('/admin/products/:id/delete', requireAuth, (req, res) => {
    const existing = db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (existing && existing.image) fs.unlink(path.join(__dirname, 'public', existing.image), () => {});
    db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.redirect('/admin/dashboard');
  });

  app.get('/admin/orders', requireAuth, (req, res) => {
    const orders = db.all('SELECT * FROM orders ORDER BY created_at DESC');
    for (const o of orders) {
      o.items = db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
    }
    res.render('admin-orders', { orders, username: req.session.username });
  });

  app.post('/admin/orders/:id/status', requireAuth, (req, res) => {
    const { status } = req.body;
    const allowed = ['Baru', 'Diproses', 'Selesai', 'Dibatalkan'];
    if (allowed.includes(status)) {
      db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    }
    res.redirect('/admin/orders');
  });

  // --- Change own password ---
  app.get('/admin/profile', requireAuth, (req, res) => {
    res.render('admin-profile', { username: req.session.username, error: null, success: null });
  });

  app.post('/admin/profile/password', requireAuth, (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    const admin = db.get('SELECT * FROM admin_users WHERE id = ?', [req.session.adminId]);

    if (!admin || !bcrypt.compareSync(current_password || '', admin.password_hash)) {
      return res.render('admin-profile', { username: req.session.username, error: 'Password lama salah', success: null });
    }
    if (!new_password || new_password.length < 8) {
      return res.render('admin-profile', { username: req.session.username, error: 'Password baru minimal 8 karakter', success: null });
    }
    if (new_password !== confirm_password) {
      return res.render('admin-profile', { username: req.session.username, error: 'Konfirmasi password tidak cocok', success: null });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    db.run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [newHash, admin.id]);
    res.render('admin-profile', { username: req.session.username, error: null, success: 'Password berhasil diubah' });
  });

  // --- Manage admin users ---
  app.get('/admin/users', requireAuth, (req, res) => {
    const users = db.all('SELECT id, username, created_at FROM admin_users ORDER BY id');
    res.render('admin-users', { users, username: req.session.username, currentId: req.session.adminId, error: null });
  });

  app.post('/admin/users/new', requireAuth, (req, res) => {
    const { username, password } = req.body;
    const users = db.all('SELECT id, username, created_at FROM admin_users ORDER BY id');

    if (!username || !password || password.length < 8) {
      return res.render('admin-users', { users, username: req.session.username, currentId: req.session.adminId, error: 'Username wajib diisi dan password minimal 8 karakter' });
    }
    const existing = db.get('SELECT id FROM admin_users WHERE username = ?', [username]);
    if (existing) {
      return res.render('admin-users', { users, username: req.session.username, currentId: req.session.adminId, error: 'Username sudah dipakai' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [username, hash]);
    res.redirect('/admin/users');
  });

  app.post('/admin/users/:id/delete', requireAuth, (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    const totalAdmins = db.get('SELECT COUNT(*) AS c FROM admin_users').c;
    const users = db.all('SELECT id, username, created_at FROM admin_users ORDER BY id');

    if (targetId === req.session.adminId) {
      return res.render('admin-users', { users, username: req.session.username, currentId: req.session.adminId, error: 'Tidak bisa menghapus akun sendiri yang sedang login' });
    }
    if (totalAdmins <= 1) {
      return res.render('admin-users', { users, username: req.session.username, currentId: req.session.adminId, error: 'Minimal harus ada 1 admin' });
    }

    db.run('DELETE FROM admin_users WHERE id = ?', [targetId]);
    res.redirect('/admin/users');
  });

  app.listen(PORT, () => {
    console.log(`Jhon Seafood 68 running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});

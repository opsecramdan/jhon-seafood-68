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

  // --- Admin auth routes ---
  app.get('/admin/login', (req, res) => res.render('login', { error: null }));

  app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminHash = process.env.ADMIN_PASSWORD_HASH || '';

    if (username === adminUser && bcrypt.compareSync(password || '', adminHash)) {
      req.session.isAdmin = true;
      req.session.username = username;
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

  app.listen(PORT, () => {
    console.log(`Jhon Seafood 68 running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});

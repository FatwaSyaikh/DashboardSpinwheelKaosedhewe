const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// ============================================================
// 1. KONEKSI POSTGRESQL DATABASE
// ============================================================
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'kaosedhewe spinwheel',
  password: 'fatwa12345',
  port: 5433,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Gagal terhubung ke database PostgreSQL:', err.message);
  } else {
    console.log('✅ Berhasil terhubung ke database PostgreSQL: kaosedhewe spinwheel');
    release();
  }
});

// ============================================================
// 2. MIDDLEWARE & LIMIT PAYLOAD (Mendukung upload foto/gambar Base64)
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: 'kaosedhewe-doorprize-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 3600000 * 4,
      httpOnly: true,
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
  }
}

// ============================================================
// 3. AUTENTIKASI ADMIN (LOGIN & LOGOUT)
// ============================================================

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
  }

  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username tidak ditemukan!' });
    }

    const admin = result.rows[0];
    let isMatch = password === admin.password_hash;
    if (!isMatch && (admin.password_hash.startsWith('$2b$') || admin.password_hash.startsWith('$2y$'))) {
      isMatch = await bcrypt.compare(password, admin.password_hash);
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Password yang Anda masukkan salah!' });
    }

    req.session.userId = admin.id;
    req.session.username = admin.username;
    res.json({ success: true, message: 'Login berhasil!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logout berhasil.' });
  });
});

// ============================================================
// 4. MANAJEMEN PROFIL ADMIN
// ============================================================

app.get('/api/admin/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, foto, created_at FROM admin_users WHERE id = $1',
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data admin tidak ditemukan.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/profile', requireAuth, async (req, res) => {
  const { username, foto } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ success: false, message: 'Username tidak boleh kosong!' });
  }

  try {
    const checkUser = await pool.query(
      'SELECT id FROM admin_users WHERE LOWER(username) = LOWER($1) AND id != $2',
      [username.trim(), req.session.userId]
    );
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Username tersebut sudah digunakan admin lain!' });
    }

    let query, params;
    if (foto) {
      query = 'UPDATE admin_users SET username = $1, foto = $2 WHERE id = $3 RETURNING id, username, foto, created_at';
      params = [username.trim(), foto, req.session.userId];
    } else {
      query = 'UPDATE admin_users SET username = $1 WHERE id = $2 RETURNING id, username, foto, created_at';
      params = [username.trim(), req.session.userId];
    }

    const result = await pool.query(query, params);
    req.session.username = result.rows[0].username;

    res.json({ success: true, message: 'Profil berhasil diperbarui!', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

app.put('/api/admin/password', requireAuth, async (req, res) => {
  const { password_lama, password_baru } = req.body;
  if (!password_lama || !password_baru) {
    return res.status(400).json({ success: false, message: 'Password saat ini dan password baru wajib diisi!' });
  }

  try {
    const result = await pool.query('SELECT * FROM admin_users WHERE id = $1', [req.session.userId]);
    const admin = result.rows[0];

    let isMatch = password_lama === admin.password_hash;
    if (!isMatch && (admin.password_hash.startsWith('$2b$') || admin.password_hash.startsWith('$2y$'))) {
      isMatch = await bcrypt.compare(password_lama, admin.password_hash);
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Password saat ini tidak sesuai!' });
    }

    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [password_baru, req.session.userId]);
    res.json({ success: true, message: 'Password berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// 5. MANAJEMEN LIST HADIAH SPINWHEEL (TAMBAH & HAPUS)
// ============================================================

// Ambil list hadiah (Publik untuk dashboard & customer wheel)
app.get('/api/hadiah', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hadiah_spinwheel ORDER BY id ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Tambah Hadiah Baru oleh Admin
app.post('/api/admin/hadiah', requireAuth, async (req, res) => {
  const { nama, gambar, fallback_icon } = req.body;
  if (!nama || nama.trim() === '') {
    return res.status(400).json({ success: false, message: 'Nama hadiah wajib diisi!' });
  }

  try {
    const query = `
      INSERT INTO hadiah_spinwheel (nama, gambar, fallback_icon)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await pool.query(query, [
      nama.trim(),
      gambar || null,
      fallback_icon || '🎁'
    ]);
    res.json({ success: true, message: 'Hadiah berhasil ditambahkan!', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Hapus Hadiah oleh Admin
app.delete('/api/admin/hadiah/:id', requireAuth, async (req, res) => {
  try {
    // Pastikan tidak menghapus semua hadiah (minimal harus ada 2 hadiah di roda)
    const countRes = await pool.query('SELECT COUNT(*) FROM hadiah_spinwheel');
    if (parseInt(countRes.rows[0].count, 10) <= 2) {
      return res.status(400).json({ success: false, message: 'Roda putar membutuhkan minimal 2 hadiah!' });
    }

    await pool.query('DELETE FROM hadiah_spinwheel WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Hadiah berhasil dihapus dari spinwheel.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// 6. MANAJEMEN TIKET & MONITORING DASHBOARD ADMIN
// ============================================================

app.post('/api/admin/tiket', requireAuth, async (req, res) => {
  const { id, nomor_hp } = req.body;
  if (!id || !nomor_hp) {
    return res.status(400).json({ success: false, message: 'Kode transaksi dan nomor HP wajib diisi!' });
  }

  try {
    const query = `
      INSERT INTO doorprize_spinwheel (id, nomor_hp, status_spin)
      VALUES ($1, $2, 'belum spin')
      RETURNING *;
    `;
    const result = await pool.query(query, [id.trim().toUpperCase(), nomor_hp.trim()]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Kode transaksi ini sudah terdaftar!' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/doorprize', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doorprize_spinwheel ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/doorprize/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM doorprize_spinwheel WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Data tiket berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// 7. SISI CUSTOMER (VERIFIKASI & KLAIM SPINWHEEL)
// ============================================================

app.post('/api/spinwheel/verifikasi', async (req, res) => {
  const { id, nomor_hp } = req.body;
  if (!id || !nomor_hp) {
    return res.status(400).json({ success: false, message: 'Kode transaksi dan nomor WhatsApp wajib diisi!' });
  }

  try {
    const result = await pool.query('SELECT * FROM doorprize_spinwheel WHERE id = $1', [id.trim().toUpperCase()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kode transaksi tidak terdaftar dalam sistem!' });
    }

    const trx = result.rows[0];
    if (trx.nomor_hp !== nomor_hp.trim()) {
      return res.status(400).json({ success: false, message: 'Nomor WhatsApp tidak cocok dengan kode transaksi ini!' });
    }

    if ((trx.status_spin || '').toLowerCase() === 'sudah spin') {
      return res.status(400).json({
        success: false,
        message: `Tiket ini sudah pernah digunakan untuk memenangkan: ${trx.hadiah}`,
      });
    }

    res.json({ success: true, message: 'Verifikasi berhasil.', data: trx });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/spinwheel/selesai', async (req, res) => {
  const { id, nama_customer, asal_kota, hadiah } = req.body;
  if (!id || !nama_customer || !asal_kota || !hadiah) {
    return res.status(400).json({ success: false, message: 'Data formulir customer dan hadiah harus lengkap!' });
  }

  try {
    const query = `
      UPDATE doorprize_spinwheel 
      SET nama_customer = $1, 
          asal_kota = $2, 
          hadiah = $3, 
          status_spin = 'sudah spin'
      WHERE id = $4 AND LOWER(status_spin) = 'belum spin'
      RETURNING *;
    `;
    const result = await pool.query(query, [
      nama_customer.trim(),
      asal_kota.trim(),
      hadiah,
      id.trim().toUpperCase(),
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Tiket tidak valid atau sudah pernah digunakan sebelumnya.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server Kaosedhewe aktif di http://localhost:${PORT}`);
});
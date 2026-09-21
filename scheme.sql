CREATE TABLE IF NOT EXISTS hadiah_spinwheel (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    gambar TEXT,
    fallback_icon VARCHAR(10) DEFAULT '👕',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Masukkan 6 hadiah awal jika tabel masih kosong
INSERT INTO hadiah_spinwheel (nama, gambar, fallback_icon)
SELECT d.nama, d.gambar, d.fallback_icon
FROM (VALUES
    ('Kaos Kaosedhewe', '/kaos.png', '👕'),
    ('Tote Bag Kanvas', '/totebag.png', '🛍️'),
    ('Voucher 50%', '/voucher.png', '🎟️'),
    ('Sticker Pack', '/sticker.png', '🏷️'),
    ('Hoodie Kaos', '/hoodie.png', '👕'),
    ('Gantungan Kunci', '/gantungan.png', '🔑')
) AS d(nama, gambar, fallback_icon);
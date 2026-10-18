CREATE TABLE bill_images (
  bill_id TEXT PRIMARY KEY, business_id TEXT NOT NULL,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0), storage_name TEXT NOT NULL UNIQUE,
  FOREIGN KEY(bill_id, business_id) REFERENCES bills(id, business_id) ON DELETE CASCADE
);

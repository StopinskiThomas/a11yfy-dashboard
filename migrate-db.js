const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'a11yfy.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Add 'standard' to sites
  db.all("PRAGMA table_info(sites)", [], (err, columns) => {
    if (err) return console.error(err);
    const hasStandard = columns.some(col => col.name === 'standard');
    if (!hasStandard) {
      db.run("ALTER TABLE sites ADD COLUMN standard TEXT DEFAULT 'WCAG2AA'");
    }
  });

  // Add 'url' to scans
  db.all("PRAGMA table_info(scans)", [], (err, columns) => {
    if (err) return console.error(err);
    const hasUrl = columns.some(col => col.name === 'url');
    if (!hasUrl) {
      db.run("ALTER TABLE scans ADD COLUMN url TEXT");
    }
  });
});

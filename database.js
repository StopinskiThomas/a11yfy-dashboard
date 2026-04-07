const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'a11yfy.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        name TEXT,
        schedule TEXT DEFAULT 'off',
        standard TEXT DEFAULT 'WCAG2AA'
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        url TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        score INTEGER,
        issues_json TEXT,
        FOREIGN KEY(site_id) REFERENCES sites(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS site_rules (
        site_id INTEGER,
        rule_id TEXT,
        enabled INTEGER DEFAULT 1,
        PRIMARY KEY(site_id, rule_id),
        FOREIGN KEY(site_id) REFERENCES sites(id)
      )`);
    });
  }
});

module.exports = db;

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'a11yfy.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("PRAGMA table_info(sites)", [], (err, columns) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    const hasStandard = columns.some(col => col.name === 'standard');
    if (!hasStandard) {
      console.log('Adding "standard" column to "sites" table...');
      db.run("ALTER TABLE sites ADD COLUMN standard TEXT DEFAULT 'WCAG2AA'", (err) => {
        if (err) {
          console.error('Error adding column:', err.message);
        } else {
          console.log('Column "standard" added successfully.');
        }
        process.exit(0);
      });
    } else {
      console.log('Column "standard" already exists.');
      process.exit(0);
    }
  });
});

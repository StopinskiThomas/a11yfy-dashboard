const express = require('express');
const cors = require('cors');
const pa11y = require('pa11y');
const db = require('./database');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function runScan(siteId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT url FROM sites WHERE id = ?', [siteId], async (err, site) => {
      if (err || !site) {
        return reject(new Error('Site not found'));
      }

      try {
        console.log(`Scanning: ${site.url}`);
        const results = await pa11y(site.url, {
          runner: 'axe',
          standard: 'WCAG2AA',
          includeWarnings: true,
          includeNotices: true,
          chromeLaunchConfig: {
            executablePath: process.env.CHROME_PATH || null,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }
        });

        const score = Math.max(0, 100 - results.issues.length);
        const issuesJson = JSON.stringify(results.issues);

        const sql = 'INSERT INTO scans (site_id, score, issues_json) VALUES (?, ?, ?)';
        db.run(sql, [siteId, score, issuesJson], function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, site_id: siteId, score, issues: results.issues });
        });
      } catch (scanErr) {
        console.error('Scan error:', scanErr);
        reject(scanErr);
      }
    });
  });
}

// Scheduled Scans (runs every hour to check what needs scanning)
// For simplicity in this version, we'll check every minute if there's anything due
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Simple logic: if schedule is 'daily', run at midnight. If 'hourly', run every hour at :00.
  // In a real app, you'd store 'last_run' and compare, but for now we use simple triggers.
  db.all('SELECT * FROM sites WHERE schedule != "off"', [], (err, sites) => {
    if (err) return console.error('Cron DB error:', err);

    sites.forEach(async (site) => {
      if (site.schedule === 'hourly' && currentMinute === 0) {
        console.log(`Cron: Running hourly scan for ${site.url}`);
        await runScan(site.id).catch(e => console.error(e));
      } else if (site.schedule === 'daily' && currentHour === 0 && currentMinute === 0) {
        console.log(`Cron: Running daily scan for ${site.url}`);
        await runScan(site.id).catch(e => console.error(e));
      }
    });
  });
});

// API: List all monitored sites
app.get('/api/sites', (req, res) => {
  const sql = `
    SELECT sites.*, 
    (SELECT score FROM scans WHERE site_id = sites.id ORDER BY timestamp DESC LIMIT 1) as latest_score,
    (SELECT timestamp FROM scans WHERE site_id = sites.id ORDER BY timestamp DESC LIMIT 1) as latest_scan
    FROM sites
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// API: Add a new site
app.post('/api/sites', (req, res) => {
  const { url, name, schedule } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  const sql = 'INSERT INTO sites (url, name, schedule) VALUES (?, ?, ?)';
  db.run(sql, [url, name || url, schedule || 'off'], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'This URL is already being monitored.' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, url, name, schedule });
  });
});

// API: Update schedule
app.patch('/api/sites/:id/schedule', (req, res) => {
  const { schedule } = req.body;
  const sql = 'UPDATE sites SET schedule = ? WHERE id = ?';
  db.run(sql, [schedule, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, schedule });
  });
});

// API: Run a scan
app.post('/api/scan/:id', async (req, res) => {
  try {
    const results = await runScan(req.params.id);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get scan history for a site
app.get('/api/scans/:site_id', (req, res) => {
  const siteId = req.params.site_id;
  const sql = 'SELECT * FROM scans WHERE site_id = ? ORDER BY timestamp DESC';
  db.all(sql, [siteId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

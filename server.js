const express = require('express');
const cors = require('cors');
const pa11y = require('pa11y');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  const { url, name } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  const sql = 'INSERT INTO sites (url, name) VALUES (?, ?)';
  db.run(sql, [url, name || url], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, url, name });
  });
});

// API: Run a scan
app.post('/api/scan/:id', async (req, res) => {
  const siteId = req.params.id;
  
  db.get('SELECT url FROM sites WHERE id = ?', [siteId], async (err, site) => {
    if (err || !site) {
      return res.status(404).json({ error: 'Site not found' });
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

      // Calculate a simple score (100 - number of issues, min 0)
      const score = Math.max(0, 100 - results.issues.length);
      const issuesJson = JSON.stringify(results.issues);

      const sql = 'INSERT INTO scans (site_id, score, issues_json) VALUES (?, ?, ?)';
      db.run(sql, [siteId, score, issuesJson], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, site_id: siteId, score, issues: results.issues });
      });
    } catch (scanErr) {
      console.error('Scan error:', scanErr);
      res.status(500).json({ error: 'Failed to scan URL: ' + scanErr.message });
    }
  });
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

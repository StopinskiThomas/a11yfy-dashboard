const express = require('express');
const cors = require('cors');
const pa11y = require('pa11y');
const axe = require('axe-core');
const db = require('./database');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable foreign keys in SQLite
db.run('PRAGMA foreign_keys = ON');

function getAxeTags(standard) {
  // Map our standards to axe-core tags
  const tags = ['wcag2a']; // Level A is always the base
  
  if (standard.includes('AA')) {
    tags.push('wcag2aa');
  }
  if (standard.includes('AAA')) {
    tags.push('wcag2aa', 'wcag2aaa');
  }
  
  if (standard.includes('21')) {
    tags.push('wcag21a');
    if (standard.includes('AA')) tags.push('wcag21aa');
  }
  
  if (standard.includes('22')) {
    tags.push('wcag21a', 'wcag22aa'); // Axe-core 4.8+ supports wcag22aa
    if (standard.includes('AA')) tags.push('wcag21aa');
  }
  
  // Remove duplicates
  return [...new Set(tags)];
}

async function getSiteRules(siteId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT rule_id, enabled FROM site_rules WHERE site_id = ?', [siteId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function runScan(siteId) {
  return new Promise(async (resolve, reject) => {
    db.get('SELECT url, standard FROM sites WHERE id = ?', [siteId], async (err, site) => {
      if (err || !site) {
        return reject(new Error('Site not found'));
      }

      try {
        console.log(`Scanning: ${site.url} with standard ${site.standard}`);
        
        // Check for custom rules
        const customRules = await getSiteRules(siteId);
        let axeConfig = {};
        
        if (customRules.length > 0) {
          const enabledRules = customRules.filter(r => r.enabled).map(r => r.rule_id);
          axeConfig = {
            runOnly: {
              type: 'rule',
              values: enabledRules
            }
          };
        } else {
          axeConfig = {
            runOnly: {
              type: 'tag',
              values: getAxeTags(site.standard || 'WCAG2AA')
            }
          };
        }

        const results = await pa11y(site.url, {
          runners: ['axe'],
          axe: axeConfig,
          includeWarnings: true,
          includeNotices: true,
          chromeLaunchConfig: {
            executablePath: process.env.CHROME_PATH || null,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }
        });

        const score = Math.max(0, 100 - results.issues.length);
        const issuesJson = JSON.stringify(results.issues);

        const sql = 'INSERT INTO scans (site_id, url, score, issues_json) VALUES (?, ?, ?, ?)';
        db.run(sql, [siteId, results.pageUrl || site.url, score, issuesJson], function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, site_id: siteId, url: results.pageUrl || site.url, score, issues: results.issues });
        });
      } catch (scanErr) {
        console.error('Scan error:', scanErr);
        reject(scanErr);
      }
    });
  });
}

// Scheduled Scans ... (rest of the file)


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
  const { url, name, schedule, standard } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  const sql = 'INSERT INTO sites (url, name, schedule, standard) VALUES (?, ?, ?, ?)';
  db.run(sql, [url, name || url, schedule || 'off', standard || 'WCAG2AA'], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'This URL is already being monitored.' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, url, name, schedule, standard });
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

// API: Update standard
app.patch('/api/sites/:id/standard', (req, res) => {
  const { standard } = req.body;
  const sql = 'UPDATE sites SET standard = ? WHERE id = ?';
  db.run(sql, [standard, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, standard });
  });
});

const puppeteer = require('puppeteer');

async function crawlAndScan(siteId) {
  return new Promise(async (resolve, reject) => {
    db.get('SELECT url FROM sites WHERE id = ?', [siteId], async (err, site) => {
      if (err || !site) return reject(new Error('Site not found'));

      try {
        console.log(`Crawling: ${site.url}`);
        const browser = await puppeteer.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto(site.url, { waitUntil: 'networkidle2' });

        const links = await page.evaluate(() => {
          const baseUrl = window.location.origin;
          return Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => href.startsWith(baseUrl)) // Internal only
            .slice(0, 10); // Limit to 10 pages for now
        });

        await browser.close();

        const uniqueLinks = [...new Set(links)];
        console.log(`Found ${uniqueLinks.length} links to scan.`);

        const results = [];
        for (const link of uniqueLinks) {
          try {
            // Helper to run scan for a specific URL
            const scanResult = await runScanForUrl(siteId, link);
            results.push(scanResult);
          } catch (e) {
            console.error(`Failed to scan ${link}:`, e);
          }
        }
        resolve(results);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function runScanForUrl(siteId, url) {
  return new Promise((resolve, reject) => {
    db.get('SELECT standard FROM sites WHERE id = ?', [siteId], async (err, site) => {
      if (err) return reject(err);
      
      try {
        const customRules = await getSiteRules(siteId);
        let axeConfig = {};
        if (customRules.length > 0) {
          axeConfig = { runOnly: { type: 'rule', values: customRules.filter(r => r.enabled).map(r => r.rule_id) } };
        } else {
          axeConfig = { runOnly: { type: 'tag', values: getAxeTags(site.standard || 'WCAG2AA') } };
        }

        const results = await pa11y(url, {
          runners: ['axe'],
          axe: axeConfig,
          chromeLaunchConfig: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
        });

        const score = Math.max(0, 100 - results.issues.length);
        const sql = 'INSERT INTO scans (site_id, url, score, issues_json) VALUES (?, ?, ?, ?)';
        db.run(sql, [siteId, url, score, JSON.stringify(results.issues)], function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, url, score });
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// API: Run a crawl & scan
app.post('/api/crawl/:id', async (req, res) => {
  try {
    const results = await crawlAndScan(req.params.id);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Run a scan ... (rest of the file)


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

// API: Get all available axe-core rules
app.get('/api/rules', (req, res) => {
  const rules = axe.getRules();
  res.json(rules);
});

// API: Get custom rules for a site
app.get('/api/sites/:id/rules', async (req, res) => {
  try {
    const rules = await getSiteRules(req.params.id);
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update custom rules for a site
app.post('/api/sites/:id/rules', (req, res) => {
  const siteId = req.params.id;
  const { rules } = req.body; // Array of { rule_id, enabled }

  db.serialize(() => {
    db.run('DELETE FROM site_rules WHERE site_id = ?', [siteId], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      if (!rules || rules.length === 0) {
        return res.json({ success: true, message: 'Custom rules cleared, using standard tags.' });
      }

      const stmt = db.prepare('INSERT INTO site_rules (site_id, rule_id, enabled) VALUES (?, ?, ?)');
      rules.forEach(rule => {
        stmt.run([siteId, rule.rule_id, rule.enabled ? 1 : 0]);
      });
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// API: Delete a site
app.delete('/api/sites/:id', (req, res) => {
  const siteId = req.params.id;
  // First delete scans (due to foreign key or just to be clean)
  db.run('DELETE FROM scans WHERE site_id = ?', [siteId], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    db.run('DELETE FROM sites WHERE id = ?', [siteId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, deleted: this.changes });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

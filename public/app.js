document.addEventListener('DOMContentLoaded', () => {
    const siteForm = document.getElementById('site-form');
    const sitesList = document.getElementById('sites-list');
    const statusMessage = document.getElementById('status-message');
    const scanResults = document.getElementById('scan-results');
    const monitoredSites = document.getElementById('monitored-sites');
    const backToList = document.getElementById('back-to-list');
    const issuesList = document.getElementById('issues-list');
    const currentSiteName = document.getElementById('current-site-name');
    const resultsSummary = document.getElementById('results-summary');

    // Fetch and display sites
    async function fetchSites() {
        try {
            const response = await fetch('/api/sites');
            const sites = await response.json();
            displaySites(sites);
        } catch (error) {
            updateStatus('Error fetching sites: ' + error.message);
        }
    }

    function displaySites(sites) {
        sitesList.innerHTML = '';
        sites.forEach(site => {
            const tr = document.createElement('tr');
            
            const scoreClass = site.latest_score >= 90 ? 'score-high' : (site.latest_score >= 70 ? 'score-medium' : 'score-low');
            const scoreDisplay = site.latest_score !== null ? 
                `<span class="score-badge ${scoreClass}">${site.latest_score}</span>` : 
                'Not scanned';

            tr.innerHTML = `
                <td>${site.name}</td>
                <td><a href="${site.url}" target="_blank">${site.url}</a></td>
                <td>${scoreDisplay}</td>
                <td>${site.latest_scan ? new Date(site.latest_scan).toLocaleString() : 'Never'}</td>
                <td>
                    <button class="scan-btn" data-id="${site.id}">Scan Now</button>
                    <button class="view-btn" data-id="${site.id}" data-name="${site.name}">View Results</button>
                </td>
            `;
            sitesList.appendChild(tr);
        });

        // Add event listeners to buttons
        document.querySelectorAll('.scan-btn').forEach(btn => {
            btn.addEventListener('click', () => runScan(btn.dataset.id));
        });
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => viewResults(btn.dataset.id, btn.dataset.name));
        });
    }

    // Add new site
    siteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(siteForm);
        const data = {
            name: formData.get('name'),
            url: formData.get('url')
        };

        try {
            const response = await fetch('/api/sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                updateStatus(`Site "${data.name}" added successfully.`);
                siteForm.reset();
                fetchSites();
            } else {
                const err = await response.json();
                updateStatus('Error: ' + err.error);
            }
        } catch (error) {
            updateStatus('Error adding site: ' + error.message);
        }
    });

    // Run scan
    async function runScan(id) {
        updateStatus('Scanning started... please wait.');
        try {
            const response = await fetch(`/api/scan/${id}`, { method: 'POST' });
            if (response.ok) {
                updateStatus('Scan complete.');
                fetchSites();
            } else {
                const err = await response.json();
                updateStatus('Scan failed: ' + err.error);
            }
        } catch (error) {
            updateStatus('Error running scan: ' + error.message);
        }
    }

    // View results
    async function viewResults(id, name) {
        try {
            const response = await fetch(`/api/scans/${id}`);
            const scans = await response.json();
            if (scans.length === 0) {
                updateStatus('No scans found for this site.');
                return;
            }
            
            const latestScan = scans[0];
            const issues = JSON.parse(latestScan.issues_json);
            
            currentSiteName.textContent = name;
            resultsSummary.innerHTML = `
                <p><strong>Score:</strong> ${latestScan.score}/100</p>
                <p><strong>Total Issues:</strong> ${issues.length}</p>
                <p><strong>Scan Date:</strong> ${new Date(latestScan.timestamp).toLocaleString()}</p>
            `;
            
            issuesList.innerHTML = '';
            issues.forEach(issue => {
                const div = document.createElement('div');
                div.className = 'issue-item';
                div.role = 'listitem';
                div.innerHTML = `
                    <h3>${issue.message}</h3>
                    <p><strong>Code:</strong> <code>${issue.code}</code></p>
                    <p><strong>Selector:</strong> <code>${issue.selector}</code></p>
                    <p><strong>Context:</strong></p>
                    <pre>${escapeHtml(issue.context)}</pre>
                `;
                issuesList.appendChild(div);
            });

            monitoredSites.hidden = true;
            document.getElementById('add-site').hidden = true;
            scanResults.hidden = false;
            backToList.focus();
        } catch (error) {
            updateStatus('Error loading results: ' + error.message);
        }
    }

    backToList.addEventListener('click', () => {
        scanResults.hidden = true;
        monitoredSites.hidden = false;
        document.getElementById('add-site').hidden = false;
        fetchSites();
    });

    function updateStatus(msg) {
        statusMessage.textContent = msg;
        // Also log to console for debugging
        console.log(msg);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initial load
    fetchSites();
});

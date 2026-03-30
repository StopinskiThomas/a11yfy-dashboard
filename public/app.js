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
    let historyChart = null;

    // Fetch and display sites
    async function fetchSites() {
        try {
            const response = await fetch('/api/sites');
            const sites = await response.json();
            displaySites(sites);
        } catch (error) {
            updateStatus('Error fetching sites: ' + error.message, 'error');
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
                <td>
                    <select class="schedule-change" data-id="${site.id}">
                        <option value="off" ${site.schedule === 'off' ? 'selected' : ''}>Off</option>
                        <option value="hourly" ${site.schedule === 'hourly' ? 'selected' : ''}>Hourly</option>
                        <option value="daily" ${site.schedule === 'daily' ? 'selected' : ''}>Daily</option>
                    </select>
                </td>
                <td>
                    <select class="standard-change" data-id="${site.id}">
                        <option value="WCAG21A" ${site.standard === 'WCAG21A' ? 'selected' : ''}>2.1 A</option>
                        <option value="WCAG21AA" ${site.standard === 'WCAG21AA' ? 'selected' : ''}>2.1 AA</option>
                        <option value="WCAG22AA" ${site.standard === 'WCAG22AA' ? 'selected' : ''}>2.2 AA</option>
                        <option value="WCAG22AAA" ${site.standard === 'WCAG22AAA' ? 'selected' : ''}>2.2 AAA</option>
                    </select>
                </td>
                <td>${scoreDisplay}</td>
                <td>${site.latest_scan ? new Date(site.latest_scan).toLocaleString() : 'Never'}</td>
                <td>
                    <button class="scan-btn" data-id="${site.id}">Scan Now</button>
                    <button class="view-btn" data-id="${site.id}" data-name="${site.name}">View Results</button>
                </td>
            `;
            sitesList.appendChild(tr);
        });

        // Add event listeners
        document.querySelectorAll('.scan-btn').forEach(btn => {
            btn.addEventListener('click', () => runScan(btn.dataset.id));
        });
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => viewResults(btn.dataset.id, btn.dataset.name));
        });
        document.querySelectorAll('.schedule-change').forEach(select => {
            select.addEventListener('change', (e) => updateSchedule(select.dataset.id, e.target.value));
        });
        document.querySelectorAll('.standard-change').forEach(select => {
            select.addEventListener('change', (e) => updateStandard(select.dataset.id, e.target.value));
        });
    }

    // Add new site
    siteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(siteForm);
        const data = {
            name: formData.get('name'),
            url: formData.get('url'),
            schedule: formData.get('schedule'),
            standard: formData.get('standard')
        };

        try {
            const response = await fetch('/api/sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                updateStatus(`Site "${data.name}" added successfully.`, 'success');
                siteForm.reset();
                fetchSites();
            } else {
                const err = await response.json();
                updateStatus('Error: ' + err.error, 'error');
            }
        } catch (error) {
            updateStatus('Error adding site: ' + error.message, 'error');
        }
    });

    async function updateSchedule(id, schedule) {
        try {
            const response = await fetch(`/api/sites/${id}/schedule`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule })
            });
            if (response.ok) {
                updateStatus('Schedule updated.', 'success');
            } else {
                const err = await response.json();
                updateStatus('Update failed: ' + err.error, 'error');
            }
        } catch (error) {
            updateStatus('Error updating schedule: ' + error.message, 'error');
        }
    }

    async function updateStandard(id, standard) {
        try {
            const response = await fetch(`/api/sites/${id}/standard`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ standard })
            });
            if (response.ok) {
                updateStatus('Standard updated.', 'success');
            } else {
                const err = await response.json();
                updateStatus('Update failed: ' + err.error, 'error');
            }
        } catch (error) {
            updateStatus('Error updating standard: ' + error.message, 'error');
        }
    }

    // Run scan
    async function runScan(id) {
        updateStatus('Scanning started... please wait.', 'info');
        try {
            const response = await fetch(`/api/scan/${id}`, { method: 'POST' });
            if (response.ok) {
                updateStatus('Scan complete.', 'success');
                fetchSites();
            } else {
                const err = await response.json();
                updateStatus('Scan failed: ' + err.error, 'error');
            }
        } catch (error) {
            updateStatus('Error running scan: ' + error.message, 'error');
        }
    }

    // View results
    async function viewResults(id, name) {
        try {
            const response = await fetch(`/api/scans/${id}`);
            const scans = await response.json();
            if (scans.length === 0) {
                updateStatus('No scans found for this site.', 'info');
                return;
            }
            
            renderChart(scans);

            const latestScan = scans[0];
            const issues = JSON.parse(latestScan.issues_json);
            
            const counts = { error: 0, warning: 0, notice: 0 };
            issues.forEach(i => {
                if (i.type === 'error' || !i.type) counts.error++;
                else if (i.type === 'warning') counts.warning++;
                else if (i.type === 'notice') counts.notice++;
            });

            currentSiteName.textContent = name;
            resultsSummary.innerHTML = `
                <div class="summary-grid" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                    <p><strong>Score:</strong> <span class="score-badge ${latestScan.score >= 90 ? 'score-high' : (latestScan.score >= 70 ? 'score-medium' : 'score-low')}">${latestScan.score}</span>/100</p>
                    <p><strong>Errors:</strong> ${counts.error}</p>
                    <p><strong>Warnings:</strong> ${counts.warning}</p>
                    <p><strong>Notices:</strong> ${counts.notice}</p>
                </div>
                <p><strong>Scan Date:</strong> ${new Date(latestScan.timestamp).toLocaleString()}</p>
            `;
            
            issuesList.innerHTML = '';
            issues.forEach(issue => {
                const type = issue.type || 'error';
                const div = document.createElement('div');
                div.className = `issue-item ${type}`;
                div.role = 'listitem';
                div.innerHTML = `
                    <h3><span class="type-badge type-${type}">${type}</span> ${issue.message}</h3>
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
            updateStatus('Error loading results: ' + error.message, 'error');
        }
    }

    function renderChart(scans) {
        const ctx = document.getElementById('history-chart').getContext('2d');
        const history = [...scans].reverse();
        const labels = history.map(s => new Date(s.timestamp).toLocaleDateString() + ' ' + new Date(s.timestamp).toLocaleTimeString());
        
        const errorData = [];
        const warningData = [];
        const noticeData = [];

        history.forEach(s => {
            const issues = JSON.parse(s.issues_json);
            let e = 0, w = 0, n = 0;
            issues.forEach(i => {
                if (i.type === 'error' || !i.type) e++;
                else if (i.type === 'warning') w++;
                else if (i.type === 'notice') n++;
            });
            errorData.push(e);
            warningData.push(w);
            noticeData.push(n);
        });

        if (historyChart) {
            historyChart.destroy();
        }

        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Errors',
                        data: errorData,
                        borderColor: '#c0392b',
                        backgroundColor: 'rgba(192, 57, 43, 0.1)',
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: 'Warnings',
                        data: warningData,
                        borderColor: '#f39c12',
                        backgroundColor: 'rgba(243, 156, 18, 0.1)',
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: 'Notices',
                        data: noticeData,
                        borderColor: '#2980b9',
                        backgroundColor: 'rgba(41, 128, 185, 0.1)',
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Count' }
                    },
                    x: { display: false }
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'A11y Issues Over Time' }
                }
            }
        });
    }

    backToList.addEventListener('click', () => {
        scanResults.hidden = true;
        monitoredSites.hidden = false;
        document.getElementById('add-site').hidden = false;
        fetchSites();
    });

    function updateStatus(msg, type = 'info') {
        statusMessage.textContent = msg;
        statusMessage.className = type;
        if (type !== 'error') {
            setTimeout(() => {
                if (statusMessage.textContent === msg) {
                    statusMessage.textContent = '';
                    statusMessage.className = 'sr-only';
                }
            }, 5000);
        }
        console.log(`[${type}] ${msg}`);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initial load
    fetchSites();
});

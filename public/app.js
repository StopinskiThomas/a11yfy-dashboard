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

    const configureRules = document.getElementById('configure-rules');
    const configSiteName = document.getElementById('config-site-name');
    const rulesContainer = document.getElementById('rules-container');
    const ruleSearch = document.getElementById('rule-search');
    const saveRulesBtn = document.getElementById('save-rules');
    const clearRulesBtn = document.getElementById('clear-rules');
    const backFromRulesBtn = document.getElementById('back-from-rules');
    
    let currentConfigSiteId = null;
    let allAvailableRules = [];

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
                    <button class="config-btn" data-id="${site.id}" data-name="${site.name}">Configure Rules</button>
                    <button class="delete-btn" data-id="${site.id}" data-name="${site.name}">Delete</button>
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
        document.querySelectorAll('.config-btn').forEach(btn => {
            btn.addEventListener('click', () => openRuleConfig(btn.dataset.id, btn.dataset.name));
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteSite(btn.dataset.id, btn.dataset.name));
        });
        document.querySelectorAll('.schedule-change').forEach(select => {
            select.addEventListener('change', (e) => updateSchedule(select.dataset.id, e.target.value));
        });
        document.querySelectorAll('.standard-change').forEach(select => {
            select.addEventListener('change', (e) => updateStandard(select.dataset.id, e.target.value));
        });
    }

    // Rule Configuration
    async function openRuleConfig(id, name) {
        currentConfigSiteId = id;
        configSiteName.textContent = name;
        updateStatus('Loading rules...', 'info');

        try {
            if (allAvailableRules.length === 0) {
                const rulesRes = await fetch('/api/rules');
                allAvailableRules = await rulesRes.json();
            }

            const siteRulesRes = await fetch(`/api/sites/${id}/rules`);
            const siteRules = await siteRulesRes.json();
            const enabledRuleIds = new Set(siteRules.filter(r => r.enabled).map(r => r.rule_id));

            renderRulesList(enabledRuleIds);

            monitoredSites.hidden = true;
            document.getElementById('add-site').hidden = true;
            configureRules.hidden = false;
            ruleSearch.focus();
        } catch (error) {
            updateStatus('Error loading rules: ' + error.message, 'error');
        }
    }

    function renderRulesList(enabledRuleIds) {
        rulesContainer.innerHTML = '';
        const filter = ruleSearch.value.toLowerCase();

        allAvailableRules.forEach(rule => {
            const matchesSearch = rule.ruleId.toLowerCase().includes(filter) || 
                                rule.description.toLowerCase().includes(filter) ||
                                rule.tags.some(t => t.toLowerCase().includes(filter));
            
            if (!matchesSearch) return;

            const div = document.createElement('div');
            div.className = 'rule-config-item';
            const isChecked = enabledRuleIds.has(rule.ruleId);
            
            div.innerHTML = `
                <input type="checkbox" id="rule-${rule.ruleId}" data-id="${rule.ruleId}" ${isChecked ? 'checked' : ''}>
                <label for="rule-${rule.ruleId}">
                    <strong>${rule.ruleId}</strong>: ${rule.description}
                    <br>
                    <small>Tags: ${rule.tags.join(', ')}</small>
                </label>
            `;
            rulesContainer.appendChild(div);
        });
    }

    ruleSearch.addEventListener('input', () => {
        const enabledOnUI = new Set(
            Array.from(document.querySelectorAll('#rules-container input[type="checkbox"]:checked'))
                .map(cb => cb.dataset.id)
        );
        renderRulesList(enabledOnUI);
    });

    saveRulesBtn.addEventListener('click', async () => {
        const enabledRuleIds = new Set(
            Array.from(document.querySelectorAll('#rules-container input[type="checkbox"]:checked'))
                .map(cb => cb.dataset.id)
        );
        
        const payload = {
            rules: Array.from(enabledRuleIds).map(id => ({ rule_id: id, enabled: true }))
        };

        try {
            const response = await fetch(`/api/sites/${currentConfigSiteId}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                updateStatus('Rules saved successfully.', 'success');
            } else {
                const err = await response.json();
                updateStatus('Save failed: ' + err.error, 'error');
            }
        } catch (error) {
            updateStatus('Error saving rules: ' + error.message, 'error');
        }
    });

    clearRulesBtn.addEventListener('click', async () => {
        if (!confirm('Clear all custom rules and use default WCAG tags?')) return;
        try {
            const response = await fetch(`/api/sites/${currentConfigSiteId}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rules: [] })
            });
            if (response.ok) {
                updateStatus('Rules reset to defaults.', 'success');
                openRuleConfig(currentConfigSiteId, configSiteName.textContent);
            }
        } catch (error) {
            updateStatus('Error resetting rules: ' + error.message, 'error');
        }
    });

    backFromRulesBtn.addEventListener('click', () => {
        configureRules.hidden = true;
        monitoredSites.hidden = false;
        document.getElementById('add-site').hidden = false;
        fetchSites();
    });

    // Site Management
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

    async function deleteSite(id, name) {
        if (!confirm(`Are you sure you want to delete "${name}"? All scan history will be lost.`)) {
            return;
        }
        try {
            const response = await fetch(`/api/sites/${id}`, { method: 'DELETE' });
            if (response.ok) {
                updateStatus(`Site "${name}" deleted.`, 'success');
                fetchSites();
            } else {
                const err = await response.json();
                updateStatus('Delete failed: ' + err.error, 'error');
            }
        } catch (error) {
            updateStatus('Error deleting site: ' + error.message, 'error');
        }
    }

    // Scanning
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

    async function viewResults(id, name) {
        try {
            const response = await fetch(`/api/scans/${id}`);
            const scans = await response.json();
            if (scans.length === 0) {
                updateStatus('No scans found for this site.', 'info');
                return;
            }
            
            renderChart(scans);
            renderHistoryTable(scans, name);

            const latestScan = scans[0];
            const previousScan = scans[1];
            const latestIssues = JSON.parse(latestScan.issues_json);
            const previousIssues = previousScan ? JSON.parse(previousScan.issues_json) : [];
            
            // Helper to create a unique key for an issue
            const issueKey = (i) => `${i.code}|${i.selector}|${i.context}`;
            const previousKeys = new Set(previousIssues.map(issueKey));
            const latestKeys = new Set(latestIssues.map(issueKey));

            const newIssues = latestIssues.filter(i => !previousKeys.has(issueKey(i)));
            const fixedIssues = previousIssues.filter(i => !latestKeys.has(issueKey(i)));
            const ongoingIssues = latestIssues.filter(i => previousKeys.has(issueKey(i)));

            const counts = { error: 0, warning: 0, notice: 0 };
            latestIssues.forEach(i => {
                if (i.type === 'error' || !i.type) counts.error++;
                else if (i.type === 'warning') counts.warning++;
                else if (i.type === 'notice') counts.notice++;
            });

            currentSiteName.textContent = name;
            document.querySelectorAll('.current-site-name-placeholder').forEach(el => el.textContent = name);
            
            let diffHtml = '';
            if (previousScan) {
                diffHtml = `
                    <div class="diff-summary" role="status">
                        <span>Changes since last scan:</span>
                        <span class="diff-new">${newIssues.length} New</span>
                        <span class="diff-fixed">${fixedIssues.length} Fixed</span>
                        <span class="diff-ongoing">${ongoingIssues.length} Ongoing</span>
                    </div>
                `;
            }

            resultsSummary.innerHTML = `
                <div class="summary-grid" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                    <p><strong>Score:</strong> <span class="score-badge ${latestScan.score >= 90 ? 'score-high' : (latestScan.score >= 70 ? 'score-medium' : 'score-low')}">${latestScan.score}</span>/100</p>
                    <p><strong>Errors:</strong> ${counts.error}</p>
                    <p><strong>Warnings:</strong> ${counts.warning}</p>
                    <p><strong>Notices:</strong> ${counts.notice}</p>
                </div>
                <p><strong>Scan Date:</strong> ${new Date(latestScan.timestamp).toLocaleString()}</p>
                ${diffHtml}
            `;
            
            issuesList.innerHTML = '';
            
            // Display New and Ongoing Issues
            latestIssues.forEach(issue => {
                const type = issue.type || 'error';
                const isNew = !previousKeys.has(issueKey(issue));
                const div = document.createElement('div');
                div.className = `issue-item ${type}`;
                div.role = 'listitem';
                div.innerHTML = `
                    <h3>
                        <span class="type-badge type-${type}">${type}</span> 
                        ${issue.message}
                        ${previousScan ? `<span class="diff-badge ${isNew ? 'diff-new' : 'diff-ongoing'}">${isNew ? 'New' : 'Ongoing'}</span>` : ''}
                    </h3>
                    <p><strong>Code:</strong> <code>${issue.code}</code></p>
                    <p><strong>Selector:</strong> <code>${issue.selector}</code></p>
                    <p><strong>Context:</strong></p>
                    <pre>${escapeHtml(issue.context)}</pre>
                `;
                issuesList.appendChild(div);
            });

            // Display Fixed Issues (if any)
            if (fixedIssues.length > 0) {
                const fixedHeader = document.createElement('div');
                fixedHeader.className = 'fixed-issues-section';
                fixedHeader.innerHTML = `<h3>Resolved Issues (Fixed)</h3>`;
                issuesList.appendChild(fixedHeader);

                fixedIssues.forEach(issue => {
                    const type = issue.type || 'error';
                    const div = document.createElement('div');
                    div.className = `issue-item ${type}`;
                    div.style.opacity = '0.7'; // Fade out fixed issues
                    div.role = 'listitem';
                    div.innerHTML = `
                        <h3>
                            <span class="type-badge type-${type}">${type}</span> 
                            ${issue.message}
                            <span class="diff-badge diff-fixed">Fixed</span>
                        </h3>
                        <p><strong>Code:</strong> <code>${issue.code}</code></p>
                        <p><strong>Selector:</strong> <code>${issue.selector}</code></p>
                    `;
                    issuesList.appendChild(div);
                });
            }

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

    function renderHistoryTable(scans, name) {
        const historyBody = document.getElementById('history-body');
        historyBody.innerHTML = '';
        scans.forEach(s => {
            const issues = JSON.parse(s.issues_json);
            let e = 0, w = 0, n = 0;
            issues.forEach(i => {
                if (i.type === 'error' || !i.type) e++;
                else if (i.type === 'warning') w++;
                else if (i.type === 'notice') n++;
            });

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(s.timestamp).toLocaleString()}</td>
                <td>${s.score}</td>
                <td>${e}</td>
                <td>${w}</td>
                <td>${n}</td>
            `;
            historyBody.appendChild(tr);
        });
    }

    backToList.addEventListener('click', () => {
        scanResults.hidden = true;
        monitoredSites.hidden = false;
        document.getElementById('add-site').hidden = false;
        fetchSites();
    });

    // Utilities
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

const pa11y = require('pa11y');

async function testScan() {
    try {
        console.log('Testing pa11y scan on example.com...');
        const results = await pa11y('https://example.com', {
            runner: 'axe',
            standard: 'WCAG2AA'
        });
        console.log('Scan successful!');
        console.log(`Found ${results.issues.length} issues.`);
        process.exit(0);
    } catch (error) {
        console.error('Scan failed:', error);
        process.exit(1);
    }
}

testScan();

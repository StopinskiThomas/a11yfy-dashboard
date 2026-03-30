# A11yFy

A11yFy is a lightweight, accessible web application designed to monitor and check webpages for accessibility issues based on **WCAG 2.2** standards.

## Features
- **Automated Scanning:** Powered by `pa11y` and `axe-core`.
- **Persistent Monitoring:** Save URLs to a dashboard and track their accessibility health over time.
- **Detailed Reports:** View specific issues, including the failing code, CSS selector, and context.
- **Accessible UI:** Built with vanilla HTML/CSS/JS, prioritizing screen-reader compatibility and high-contrast visuals.

## Getting Started

### Prerequisites
- Node.js (v16 or higher recommended)
- npm

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
1. Start the server:
   ```bash
   npm start
   ```
2. Open your browser and navigate to `http://localhost:3000`.

## Tech Stack
- **Backend:** Node.js, Express, SQLite
- **Frontend:** Vanilla HTML5, CSS3, JavaScript
- **Accessibility Engine:** Pa11y, Axe-core

## License
ISC

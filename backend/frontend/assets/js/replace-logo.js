const fs = require('fs');

const dir = '.';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const oldRegex = /<a href="index\.html" class="logo">[\s\S]*?<\/a>/;

const newLogo = `<a href="index.html" class="logo" style="display: flex; flex-direction: column; gap: 2px; padding: 4px 0;">
        <svg width="45" height="45" viewBox="0 0 100 100" fill="none" stroke="url(#logoGrad)" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
          <defs>
            <linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#df2020" />
              <stop offset="100%" stop-color="#14143a" />
            </linearGradient>
          </defs>
          <path d="M 10 65 L 30 25 L 50 75 L 70 25 L 90 65 L 50 90 Z" />
          <path d="M 30 25 L 50 5 L 70 25" />
        </svg>
        <span style="font-size: 0.75rem; letter-spacing: 1px; color: #14143a; font-weight: 800; margin-top: -6px;">SHUBHAM XEROX</span>
      </a>`;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let updated = content.replace(oldRegex, newLogo);
  if (content !== updated) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log(`Updated ${file}`);
  }
});

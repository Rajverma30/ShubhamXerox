const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

// The original listeners are inside initApp:
// 1. Desktop listener:
/*
  // --- Click toggle for nav dropdowns ---
  document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropdown = e.target.closest('.nav-dropdown');
      dropdown.classList.toggle('is-open');
      document.querySelectorAll('.nav-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('is-open');
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('is-open'));
    }
  });
*/

// 2. Mobile listener:
/*
  // Handle mobile nav dropdown toggle
  document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      trigger.parentElement.classList.toggle('mobile-open');
    });
  });
*/

const desktopRegex = /\/\/ --- Click toggle for nav dropdowns ---[\s\S]*?d\.classList\.remove\('is-open'\)\);\n\s*\}\n\s*\}\);/g;
const mobileRegex = /\/\/ Handle mobile nav dropdown toggle[\s\S]*?trigger\.parentElement\.classList\.toggle\('mobile-open'\);\n\s*\}\);\n\s*\}\);/g;

// Replace both with a single, unified listener, or just rewrite the desktop one and remove the mobile one.
const newListener = `// --- Click toggle for nav dropdowns (Unified) ---
  document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const dropdown = e.target.closest('.nav-dropdown');
      
      const wasOpen = dropdown.classList.contains('is-open') || dropdown.classList.contains('mobile-open');
      
      // Close all dropdowns
      document.querySelectorAll('.nav-dropdown').forEach(d => {
        d.classList.remove('is-open');
        d.classList.remove('mobile-open');
      });

      // If it wasn't open before, open it now
      if (!wasOpen) {
        dropdown.classList.add('is-open');
        dropdown.classList.add('mobile-open');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(d => {
        d.classList.remove('is-open');
        d.classList.remove('mobile-open');
      });
    }
  });`;

if (content.match(desktopRegex)) {
  content = content.replace(desktopRegex, newListener);
  content = content.replace(mobileRegex, '// Mobile nav dropdown toggle handled by unified listener above');
  fs.writeFileSync(file, content);
  console.log("Successfully fixed nav dropdowns!");
} else {
  console.log("Regex did not match desktop listener!");
}

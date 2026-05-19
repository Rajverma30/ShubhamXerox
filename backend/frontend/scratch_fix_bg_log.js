const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

const bgRegex = /const item = backgroundRenderQueue\.shift\(\);/g;
const newBg = `const item = backgroundRenderQueue.shift();
      console.log('Background popped item:', item.id, 'Queue length:', backgroundRenderQueue.length);`;

content = content.replace(bgRegex, newBg);
fs.writeFileSync(file, content);
console.log('Added log to backgroundRenderLoop.');

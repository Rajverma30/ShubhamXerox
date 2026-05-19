const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('id="authLink"')) {
    // Inject the link at the end of nav-links
    content = content.replace(/(<div class="nav-links"[^>]*>[\s\S]*?)<\/div>/g, '$1  <a href="login.html" id="authLink" class="dynamic-auth-link" style="color: var(--primary);">Login</a>\n      </div>');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Injected Login button into ${file}`);
  } else {
    // Make sure it has ID for script.js
    if (!content.includes('id="authLink"')) {
       content = content.replace(/class="dynamic-auth-link"/g, 'id="authLink" class="dynamic-auth-link"');
       fs.writeFileSync(file, content, 'utf8');
       console.log(`Fixed Login button ID in ${file}`);
    }
  }
});

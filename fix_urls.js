const fs = require('fs');
const files = ['frontend/main.js', 'frontend/auth.js', 'frontend/auth_backup.js'];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');
  
  // Update the definition first
  content = content.replace(/var API_URL = 'http:\/\/localhost:5000\/api';/g, 
    "var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api';");
  
  // Replace single quotes
  content = content.replace(/'http:\/\/localhost:5000\/api/g, "API_URL + '");
  
  // Replace template literals
  content = content.replace(/`http:\/\/localhost:5000\/api/g, "\\`${API_URL}");

  // Cleanup API_URL + '' if it happens
  content = content.replace(/API_URL \+ ''/g, "API_URL");
  
  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
});

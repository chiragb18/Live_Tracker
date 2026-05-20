const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;

// Create a simple zero-dependency static file server
const server = http.createServer((req, res) => {
  let filePath = '.' + req.url.split('?')[0];
  if (filePath === './') {
    filePath = './admin.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Local Static Server is running at http://localhost:${PORT}`);
  console.log(`🔑 Exposing server securely to the internet via ngrok...`);
  
  // Launch ngrok using npx in the background
  const ngrokProcess = exec(`npx ngrok http ${PORT}`);

  // Poll ngrok client API to find the tunnel URL
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.tunnels && json.tunnels.length > 0) {
            clearInterval(interval);
            const httpsTunnel = json.tunnels.find(t => t.proto === 'https');
            const publicUrl = httpsTunnel ? httpsTunnel.public_url : json.tunnels[0].public_url;
            console.log('\n=============================================================');
            console.log('⚡ HYPERTRACK NGROK TUNNEL ONLINE!');
            console.log(`👉 ADMIN DASHBOARD: ${publicUrl}/admin.html`);
            console.log('=============================================================\n');
            console.log('1. Click or open the Admin Dashboard link above on your PC.');
            console.log('2. Click "Firebase Setup" (bottom-left) to link your database.');
            console.log('3. Generate a Tracker Link and open it on another device to start tracking!');
          }
        } catch (e) {
          // JSON parsing may fail until ngrok is fully initialized
        }
      });
    }).on('error', () => {
      if (attempts > 20) {
        clearInterval(interval);
        console.log('\n⚠️  Could not automatically retrieve ngrok tunnel.');
        console.log('Please make sure ngrok is authenticated. You can do this by running:');
        console.log('   npx ngrok config add-authtoken <YOUR_AUTHTOKEN>');
        console.log('Then run "npm start" again.\n');
      }
    });
  }, 1000);
});

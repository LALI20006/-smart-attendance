const devcert = require('devcert');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    console.log("Requesting certificate... You may see a prompt to install a trusted root certificate.");
    let ssl = await devcert.certificateFor('attendance.com');
    fs.writeFileSync(path.join(__dirname, 'certs', 'server.key.pem'), ssl.key);
    fs.writeFileSync(path.join(__dirname, 'certs', 'server.cert.pem'), ssl.cert);
    console.log("Certificates generated and saved successfully!");
  } catch (err) {
    console.error("Failed to generate certificate:", err);
  }
}

run();

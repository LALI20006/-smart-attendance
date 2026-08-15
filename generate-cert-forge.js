const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

console.log('Generating self-signed certificate for attendance.com...');

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();

cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

const attrs = [{
  name: 'commonName',
  value: 'attendance.com'
}];
cert.setSubject(attrs);
cert.setIssuer(attrs);

cert.setExtensions([{
  name: 'basicConstraints',
  cA: true
}, {
  name: 'subjectAltName',
  altNames: [{
    type: 2, // DNS
    value: 'attendance.com'
  }]
}]);

cert.sign(keys.privateKey, forge.md.sha256.create());

const pemCert = forge.pki.certificateToPem(cert);
const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

const certsDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir);
}

fs.writeFileSync(path.join(certsDir, 'server.cert.pem'), pemCert);
fs.writeFileSync(path.join(certsDir, 'server.key.pem'), pemKey);

console.log('Certificates generated and saved successfully in certs/ directory.');

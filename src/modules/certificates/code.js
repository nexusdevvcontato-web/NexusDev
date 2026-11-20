const { randomBytes } = require('node:crypto');

function generateCertificateCode() {
  // Opaque 128-bit identifier: contains no name, email, XP, or course-progress metadata.
  return `NXD-${randomBytes(16).toString('hex').toUpperCase()}`;
}

module.exports = { generateCertificateCode };

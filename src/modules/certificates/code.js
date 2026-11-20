const { randomBytes } = require('node:crypto');

function generateCertificateCode(name, completedCount) {
  const cleanName = (typeof name === 'string' ? name : 'ALUNO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  const count = Number.isInteger(completedCount) && completedCount >= 0 ? completedCount : 0;
  // 80 bits from the OS CSPRNG; unlike Math.random(), this is suitable for public bearer-like identifiers.
  const randomSuffix = randomBytes(10).toString('hex').toUpperCase();
  return `NXD-2026-${cleanName || 'DEV'}-${String(count).padStart(3, '0')}-${randomSuffix}`;
}

module.exports = { generateCertificateCode };

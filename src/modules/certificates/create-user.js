function isCertificateCodeDuplicateKey(error) {
  return Boolean(error?.code === 11000 && (
    error?.keyPattern?.certificateCode === 1 ||
    (error?.keyValue && Object.prototype.hasOwnProperty.call(error.keyValue, 'certificateCode'))
  ));
}

async function createUserWithCertificateCode(UserModel, userData, generateCode, maxAttempts = 3) {
  if (typeof UserModel?.create !== 'function' || typeof generateCode !== 'function') {
    throw new TypeError('User model and certificate code generator are required.');
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await UserModel.create({ ...userData, certificateCode: generateCode() });
    } catch (error) {
      if (!isCertificateCodeDuplicateKey(error) || attempt === maxAttempts - 1) throw error;
    }
  }
  throw new Error('Unable to create user with a unique certificate code.');
}

module.exports = { createUserWithCertificateCode, isCertificateCodeDuplicateKey };

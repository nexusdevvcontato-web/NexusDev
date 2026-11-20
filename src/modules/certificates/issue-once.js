async function issueCertificateOnce(UserModel, userId, candidateCode, issuedAt, createReplacementCode, snapshot = {}) {
  let code = candidateCode;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const issued = await UserModel.findOneAndUpdate(
        { _id: userId, certificateIssuedAt: null },
        { $set: {
          ...snapshot,
          certificateCode: code,
          certificateIssuedAt: issuedAt
        } },
        { new: true }
      );
      return issued || UserModel.findById(userId);
    } catch (error) {
      // Only retry an actual unique-index collision on the certificate code.
      if (error?.code !== 11000 || error?.keyPattern?.certificateCode !== 1 || !createReplacementCode || attempt === 2) throw error;
      code = createReplacementCode();
    }
  }
  return null;
}

module.exports = { issueCertificateOnce };

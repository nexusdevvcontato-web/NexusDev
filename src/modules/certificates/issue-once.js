async function issueCertificateOnce(UserModel, userId, candidateCode, issuedAt) {
  const issued = await UserModel.findOneAndUpdate(
    { _id: userId, certificateIssuedAt: null },
    { $set: { certificateCode: candidateCode, certificateIssuedAt: issuedAt } },
    { new: true }
  );
  return issued || UserModel.findById(userId);
}

module.exports = { issueCertificateOnce };

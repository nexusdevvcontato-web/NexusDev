const { isKnownChallengeId } = require('../curriculum/catalog');

function buildQuery(UserModel, filter, projection) {
  return UserModel.findOne(filter).select(projection).lean();
}

async function lookupPublicCertificate(UserModel, code) {
  const certificate = await buildQuery(
    UserModel,
    { certificateCode: code },
    'certificateCode certificateIssuedAt privacyPreferences'
  );
  if (!certificate || !certificate.certificateIssuedAt) {
    return { status: 404, body: { valid: false, error: 'Código de certificado não encontrado.' } };
  }
  if (certificate.privacyPreferences?.showCertificateDetails === false) {
    return { status: 200, body: { valid: true, code: certificate.certificateCode, publicDetails: false } };
  }

  const user = await buildQuery(
    UserModel,
    {
      _id: certificate._id,
      certificateCode: code,
      certificateIssuedAt: { $ne: null },
      'privacyPreferences.showCertificateDetails': { $ne: false }
    },
    'certificateCode certificateIssuedAt privacyPreferences name completedIds xp githubUrl liveUrl'
  );
  if (!user) {
    const latest = await buildQuery(
      UserModel,
      { certificateCode: code },
      'certificateCode certificateIssuedAt privacyPreferences'
    );
    if (!latest || !latest.certificateIssuedAt) {
      return { status: 404, body: { valid: false, error: 'Código de certificado não encontrado.' } };
    }
    return { status: 200, body: { valid: true, code: latest.certificateCode, publicDetails: false } };
  }

  return {
    status: 200,
    body: {
      valid: true,
      publicDetails: true,
      code: user.certificateCode,
      studentName: user.name,
      completedCount: new Set((Array.isArray(user.completedIds) ? user.completedIds : []).filter(isKnownChallengeId)).size,
      xp: user.xp,
      issuedAt: user.certificateIssuedAt,
      githubUrl: user.githubUrl,
      liveUrl: user.liveUrl
    }
  };
}

module.exports = { lookupPublicCertificate };

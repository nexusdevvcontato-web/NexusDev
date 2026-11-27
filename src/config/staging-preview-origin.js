function parseStagingPreviewOrigin(
  rawOrigin,
  nodeEnv = process.env.NODE_ENV || 'development',
  renderGitBranch = process.env.RENDER_GIT_BRANCH || ''
) {
  if (!rawOrigin) return null;
  // Render runs Node services with NODE_ENV=production, including staging.
  // Permit this narrowly only on the dedicated staging branch; never on main.
  if (nodeEnv === 'production' && renderGitBranch !== 'rebuild/v2-security') {
    throw new Error('STAGING_PREVIEW_ORIGIN só pode ser configurada no branch dedicado de staging.');
  }

  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error('STAGING_PREVIEW_ORIGIN deve ser uma origem HTTPS válida do Vercel Preview.');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.port ||
    !parsed.hostname.endsWith('.vercel.app')
  ) {
    throw new Error('STAGING_PREVIEW_ORIGIN deve conter somente uma origem HTTPS *.vercel.app.');
  }

  return parsed.origin;
}

module.exports = { parseStagingPreviewOrigin };

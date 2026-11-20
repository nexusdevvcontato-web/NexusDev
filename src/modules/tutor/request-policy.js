const MAX_FILES = 10;
const MAX_FILE_BYTES = 50_000;
const MAX_TOTAL_CODE_BYTES = 100_000;
const MAX_INSTRUCTIONS = 8_000;
const MAX_FAILED_TESTS = 20;

function boundedString(value, maxLength, required = false) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if ((required && clean.length === 0) || clean.length > maxLength) return null;
  return clean;
}

function validateTutorRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Corpo da solicitação inválido.' };
  const challengeTitle = boundedString(body.challengeTitle, 160, true);
  const language = boundedString(body.language, 32, true);
  const targetFunction = body.targetFunction === undefined ? '' : boundedString(body.targetFunction, 120);
  const instructions = body.instructions === undefined ? '' : boundedString(body.instructions, MAX_INSTRUCTIONS);
  if (!challengeTitle || !language || targetFunction === null || instructions === null) return { ok: false, error: 'Dados da aula inválidos ou acima do limite permitido.' };
  const allowedLanguages = new Set(['javascript', 'js', 'html', 'css', 'react', 'node', 'nodejs', 'python', 'sql', 'typescript', 'ts']);
  if (!allowedLanguages.has(language.toLowerCase())) return { ok: false, error: 'Linguagem não suportada pelo tutor.' };
  const files = body.filesMap === undefined ? {} : body.filesMap;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return { ok: false, error: 'Mapa de arquivos inválido.' };
  const entries = Object.entries(files);
  if (entries.length > MAX_FILES) return { ok: false, error: 'Quantidade de arquivos acima do limite.' };
  let totalBytes = 0;
  const filesMap = {};
  for (const [name, content] of entries) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(name) || typeof content !== 'string') return { ok: false, error: 'Arquivo inválido.' };
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) return { ok: false, error: 'Um dos arquivos excede 50 KB.' };
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_CODE_BYTES) return { ok: false, error: 'O código enviado excede 100 KB no total.' };
    filesMap[name] = content;
  }
  const failedInput = body.failedTests === undefined ? [] : body.failedTests;
  if (!Array.isArray(failedInput) || failedInput.length > MAX_FAILED_TESTS) return { ok: false, error: 'Lista de testes com falha inválida.' };
  const failedTests = [];
  for (const item of failedInput) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'Resultado de teste inválido.' };
    const description = boundedString(item.description, 300);
    const error = boundedString(item.error, 500);
    if (description === null || error === null) return { ok: false, error: 'Descrição ou erro de teste excede o limite permitido.' };
    failedTests.push({ description, error });
  }
  return { ok: true, value: { challengeTitle, language: language.toLowerCase(), targetFunction, instructions, filesMap, failedTests } };
}

module.exports = { validateTutorRequest, limits: Object.freeze({ MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_CODE_BYTES, MAX_INSTRUCTIONS, MAX_FAILED_TESTS }) };
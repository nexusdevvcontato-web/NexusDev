'use strict';

const CORS_ORIGIN_ERROR = 'Origem não permitida pela política CORS.';

function createApiErrorHandlers() {
  function notFound(_req, res) {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  }

  function errorHandler(error, _req, res, next) {
    if (res.headersSent) return next(error);

    if (error?.message === CORS_ORIGIN_ERROR) {
      return res.status(403).json({ error: 'Origem não permitida.' });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Corpo JSON inválido.' });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Corpo da requisição excede o limite permitido.' });
    }
    if (error?.type === 'encoding.unsupported') {
      return res.status(415).json({ error: 'Codificação da requisição não suportada.' });
    }

    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }

  return Object.freeze({ notFound, errorHandler });
}

module.exports = { createApiErrorHandlers, CORS_ORIGIN_ERROR };

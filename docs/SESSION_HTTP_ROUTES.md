# Contrato HTTP de autenticação por sessão

**Branch:** `rebuild/v2-security`  
**Status:** rotas paralelas montadas no Express; frontend e ambiente staging ainda não integrados.  
**Ativação:** requer `SESSION_ACCESS_TOKEN_SECRET` exclusivo (>=32 caracteres), distinto de `JWT_SECRET` e `REAUTH_TOKEN_SECRET`. Sem essa variável, os endpoints de sessão respondem 503.  
**Produção:** nenhuma variável, banco, deploy ou serviço foi alterado.

## Rotas adicionadas

Todas as rotas usam o prefixo `/api/auth/session`. O contrato Bearer legado `/api/auth/login`, `/register`, `/google` e `/api/me` permanece inalterado durante a migração paralela.

| Método | Rota | Proteção |
|---|---|---|
| POST | `/register` | Rate limit; cria conta e sessão |
| POST | `/login` | Rate limit; senha e sessão |
| POST | `/google` | Rate limit; valida credential Google no backend |
| POST | `/refresh` | Refresh cookie + Origin exato + CSRF |
| POST | `/logout` | CSRF + access token vinculado à sessão |
| POST | `/logout-all` | CSRF + access token vinculado à sessão |
| GET | `/sessions` | Access token vinculado à sessão |
| DELETE | `/sessions/:sessionId` | CSRF + access token + ownership |

## Transporte e armazenamento

- Access token de 10 minutos (limite técnico de 15 minutos) no JSON; o frontend deve mantê-lo apenas em memória.
- Refresh token opaco; somente hash é persistido; valor entregue apenas no cookie `__Host-nexusdev_refresh`.
- Cookie refresh: HttpOnly, Secure, Path=/, SameSite=Lax por padrão, sem Domain.
- Cookie CSRF: Secure, não HttpOnly, Path=/, mesmo SameSite e sem Domain.
- O endpoint de refresh exige Origin exato allowlisted, igualdade constante entre cookie CSRF e header, e valida o hash CSRF associado ao registro específico do refresh token. A associação por token preserva a capacidade de reconhecer replay: um token antigo acompanhado do seu CSRF original alcança a rotação e pode revogar a sessão; CSRF inválido é rejeitado antes.
- Refresh e respostas de autenticação usam `Cache-Control: no-store`.
- Sessões e refresh tokens dependem de transações MongoDB; a topologia deve suportar replica set.

## Importante: migração não concluída

1. O frontend ainda consome o contrato Bearer legado e persiste token em localStorage.
2. As rotas privadas antigas continuam usando `requireAuth`; ainda não foram migradas para `requireSessionAccess`.
3. A API de sessão paralela não é ativada até provisionar o segredo dedicado no ambiente isolado.
4. O middleware CSRF para operações mutáveis valida Origin, refresh ativo e hash CSRF da sessão; o middleware de access token valida separadamente o JWT e a sessão ativa.
5. A integração de logout usa ambos. A ordem no Express valida CSRF e, em seguida, a identidade da sessão pelo access token.
6. Não há teste real de navegador, proxy Vercel ou backend Render staging nesta etapa.
7. Nenhum endpoint de sessão foi testado contra o Render atual.

## Próximos critérios

- Configurar segredo distinto somente no Render staging e Preview Vercel autorizado.
- Implementar cliente frontend em memória, bootstrap por refresh, concorrência entre abas e logout.
- Adicionar testes HTTP de ponta a ponta para cookies, refresh válido, replay, CSRF inválido, logout e revogação.
- Migrar rotas privadas gradualmente, verificando compatibilidade de cada consumidor.
- Planejar a invalidação dos JWTs legados.
- Produção, merge, proxy e migração de banco exigem autorização específica.

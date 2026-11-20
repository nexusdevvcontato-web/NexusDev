# Auditoria de sessão e ciclo de autenticação

**Branch:** `rebuild/v2-security`  
**Status:** auditoria estática concluída; correções estruturais ainda pendentes.  
**Escopo:** sessão web, armazenamento do token, hidratação, logout, expiração e revogação.  
**Produção:** não acessada nem modificada.

## Resumo executivo

A autenticação valida JWT HS256 no backend e recarrega o usuário no MongoDB a cada requisição protegida. Entretanto, a sessão do navegador ainda depende de um bearer token persistido em `localStorage`, e o logout atual remove apenas os dados locais. Não foi encontrada revogação server-side de tokens de acesso.

Isso significa que um token copiado antes do logout pode continuar válido até expirar, desde que não haja outra alteração que invalide a conta/segredo. O armazenamento em `localStorage` também amplia o impacto de qualquer XSS: scripts executados na origem podem ler o bearer token.

## Evidências verificadas

### Frontend — `src/App.jsx`

- Inicializa `authToken` lendo `localStorage.getItem('nexusdev_token')`.
- A persistência do token é feita após autenticação; a hidratação consulta `GET /api/me` com `Authorization: Bearer`.
- Quando `/api/me` falha, limpa o estado e remove `nexusdev_token`.
- `handleLogout` limpa `currentUser`, `authToken` e `nexusdev_token`; não chama endpoint de logout.
- `nexusdev_current_user` também é persistido, mas é apenas cache de interface e não deve ser tratado como fonte de autorização.
- `nexusdev_google_client_id` é persistido; Client ID OAuth é identificador público, não segredo.
- O código de sincronização usa o bearer token para chamadas autenticadas.

### Backend — `server.js`

- `signUserToken` emite JWT HS256 contendo `id`, usando `JWT_EXPIRES_IN`.
- `requireAuth` valida algoritmo HS256 e expiração por `jwt.verify`, e busca o usuário no MongoDB.
- Não há claim de sessão individual, versão de sessão ou lista de tokens revogados na validação atual.
- Não foi encontrado endpoint de logout/revogação de access token.
- O default atual de `JWT_EXPIRES_IN` é `30d`; configuração aceita até 365 dias.
- O backend não persiste tokens de acesso; logo, não consegue revogar um token individual emitido anteriormente.
- A prova de reautenticação tem consumo atômico de uso único no módulo, mas ainda não está conectada a uma rota de ação sensível.

## Riscos e prioridade

| Prioridade | Achado | Impacto |
|---|---|---|
| Alta | Bearer token em `localStorage` | Exposição do token em caso de XSS na origem |
| Alta | Logout somente local | Token copiado pode continuar válido após logout |
| Alta | Ausência de revogação server-side | Não há encerramento imediato de uma sessão comprometida |
| Média | TTL padrão de 30 dias | Janela longa de uso para token roubado |
| Média | Sem identificador de sessão individual | Revogação por dispositivo não está disponível |
| Média | JWT sem `iss`/`aud` explícitos | Menor separação de contexto entre emissores/consumidores |

## Plano de correção recomendado

1. **Definir arquitetura de sessão antes de alterar o contrato.** Preferência: cookie `HttpOnly`, `Secure`, `SameSite` apropriado, com proteção CSRF e origens/CORS restritas. Não migrar silenciosamente enquanto o frontend depende de Bearer.
2. Se cookies não forem viáveis no primeiro ciclo, reduzir o TTL do access token e implementar refresh-token rotativo, opaco, armazenado apenas como hash no banco, com revogação e detecção de reutilização.
3. Introduzir sessões persistidas com identificador aleatório por dispositivo; guardar somente hash do segredo de refresh no MongoDB.
4. Criar endpoints autenticados para logout da sessão atual e encerramento de todas as sessões, com invalidação server-side.
5. Vincular access token à sessão (claim `sid`) e validar que a sessão permanece ativa em cada requisição protegida.
6. Adicionar limites de sessão, expiração por inatividade, rotação, auditoria sem tokens/credenciais e limpeza TTL de registros expirados.
7. Atualizar frontend para limpar a sessão local mesmo quando o servidor estiver indisponível, exibindo claramente quando a revogação remota não puder ser confirmada.
8. Adicionar testes de integração para logout, token roubado após logout, revogação global, expiração, refresh concorrente, replay e sessão expirada.

## Decisões e bloqueios

- Não escolher cookie vs. bearer com refresh sem confirmar os requisitos de domínio, preview/staging e compatibilidade de clientes.
- Não adicionar endpoint de logout que apenas responda sucesso sem invalidar a credencial no servidor.
- Não afirmar que logout atual revoga token: ele só apaga o token do navegador.
- Não alterar `JWT_EXPIRES_IN` global sem avaliar impacto nas sessões existentes e no frontend.
- Não migrar usuários, limpar tokens ou alterar dados de produção.
- A prova de reautenticação permanece independente e não habilita exclusão de conta.

## Critérios de aceite para a próxima implementação

- Token de sessão não fica acessível via JavaScript, ou há mitigação documentada e risco residual aceito.
- Logout invalida a sessão no servidor.
- Sessões podem ser revogadas individualmente e em massa.
- Access tokens expirados, revogados, com sessão desconhecida ou claims inválidos retornam 401.
- Refresh é rotativo e reutilização invalida a família da sessão.
- Testes cobrem concorrência e replay.
- Nenhum token, senha, cookie ou credencial aparece em logs, analytics ou URLs.

**Conclusão:** a autenticação básica funciona, mas a gestão de ciclo de vida de sessão ainda não atende ao objetivo de revogação imediata. Esta auditoria não constitui aprovação para produção.

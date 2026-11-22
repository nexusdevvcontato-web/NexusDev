# Configuração da recuperação de senha (Gmail API)

A recuperação de senha está implementada na branch `rebuild/v2-security`, mas permanece desativada até que a integração OAuth seja configurada no Render de staging.

## Por que Gmail API

O NexusDev envia e-mails pela API oficial do Gmail, usando OAuth 2.0 e o escopo mínimo `https://www.googleapis.com/auth/gmail.send`. Não usa senha da conta, senha de aplicativo, SMTP ou domínio próprio. O endereço remetente precisa ser a conta Gmail autorizada ou um alias permitido nessa conta.

## Preparação no Google Cloud

1. Crie ou selecione um projeto no Google Cloud e ative a **Gmail API**.
2. Configure a tela de consentimento OAuth. Durante desenvolvimento, adicione a conta remetente como usuário de teste, se o Google permitir esse modo para o projeto.
3. Crie credenciais OAuth 2.0 do tipo **Web application**. Cadastre uma URI de redirecionamento HTTPS de um fluxo OAuth controlado e seguro para obter autorização offline. Não use credenciais de frontend.
4. Solicite somente o escopo `https://www.googleapis.com/auth/gmail.send` e obtenha um refresh token com acesso offline. O Google pode exigir verificação do aplicativo para disponibilizar o escopo sensível a usuários fora da lista de teste.
5. Nunca compartilhe client secret ou refresh token no chat, GitHub, frontend ou logs.

## Variáveis no Render staging

Configure exclusivamente no serviço Render `nexusdev-staging-v2`:

- `GMAIL_CLIENT_ID`: OAuth client ID.
- `GMAIL_CLIENT_SECRET`: OAuth client secret.
- `GMAIL_REFRESH_TOKEN`: refresh token gerado após consentimento.
- `GMAIL_FROM_EMAIL`: endereço Gmail autorizado que será o remetente.
- `FRONTEND_URL`: origem HTTPS do Preview Vercel com a tela de redefinição.

As variáveis antigas `RESEND_API_KEY` e `PASSWORD_RESET_FROM_EMAIL` não são mais utilizadas.

## Fluxo e proteção

1. `POST /api/auth/password-reset/request` responde genericamente para evitar enumeração de contas.
2. O backend armazena somente o SHA-256 de um token aleatório de 256 bits, válido por 20 minutos.
3. O Gmail entrega o link de uso único.
4. O frontend envia token e nova senha para `POST /api/auth/password-reset/confirm`.
5. O backend altera a senha em transação, consome o token, revoga as sessões existentes e invalida qualquer prova de reautenticação ainda válida.

## Ativação

Não configure credenciais no Render nem habilite em produção até testar no Preview e no Render staging. Verifique envio, entrega, token expirado/reutilizado, troca de senha e revogação de sessões. O refresh token deve ser tratado como segredo de longa duração e revogado no Google se houver suspeita de exposição.

## Runbook de validação manual no staging

**Estado verificado em 2026-11-22:** o backend da branch `rebuild/v2-security` passou na CI no commit `a20e34102b293286eb95079242e5eeccde31c588` (327 testes aprovados) e esse mesmo commit está ativo no serviço Render `nexusdev-staging-v2`. A implantação do backend não comprova que o Gmail OAuth esteja configurado: a recuperação permanece indisponível enquanto qualquer uma das cinco variáveis acima estiver ausente. A presença/validade dessas credenciais não foi confirmada e nenhum valor secreto foi consultado.

### Pré-requisitos seguros

- Uma caixa Gmail de teste controlada pela equipe e autorizada no OAuth.
- Uma conta NexusDev descartável criada somente no staging, com acesso à caixa de teste.
- O Preview Vercel correspondente, configurado para usar exclusivamente `https://nexusdev-staging-v2.onrender.com`.
- Confirmação de que `FRONTEND_URL` aponta para esse Preview HTTPS e que CORS permite exatamente sua origem.
- Nenhuma conta de usuário real, senha pessoal ou banco de produção.

### Sequência de teste

1. No Render, conferir somente a presença das cinco variáveis de staging; nunca copiar ou exibir seus valores. Se alguma estiver ausente, parar aqui: o endpoint deve responder `503` e nenhum e-mail será enviado.
2. No Preview, solicitar recuperação para a conta descartável. Esperado: resposta genérica `202`, sem revelar se a conta existe.
3. Confirmar recebimento na caixa de teste. Verificar remetente autorizado, link HTTPS do Preview e token no fragmento da URL (`#`), não em query string.
4. Abrir o link e concluir a troca por uma senha de teste nova. Esperado: confirmação de sucesso e token removido da barra de endereço após captura pelo frontend.
5. Reutilizar o mesmo link. Esperado: rejeição como inválido, expirado ou já utilizado.
6. Solicitar outro link e aguardar mais de 20 minutos antes de usá-lo. Esperado: rejeição por expiração.
7. Confirmar que a senha antiga não autentica e que a nova senha funciona; sessões anteriores devem permanecer revogadas.
8. Se a conta descartável tiver uma prova de reautenticação válida antes da troca, confirmar que ela também deixa de ser aceita depois da redefinição.
9. Inspecionar logs e histórico da caixa sem copiar token, senha, OAuth access token ou refresh token para evidências.

### Limites e resultado

- A suíte automatizada confirma hash SHA-256 do token, validade de 20 minutos, uso único, resposta genérica, revogação transacional de sessões e invalidação da prova de reautenticação. A CI mais recente está em https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44964689183.
- A entrega Gmail, a configuração OAuth no Render, o fluxo completo no navegador e a revogação observada com uma conta real descartável ainda não foram testados.
- Não habilitar produção, não usar e-mails de usuários, não publicar o Preview e não registrar tokens nos logs.

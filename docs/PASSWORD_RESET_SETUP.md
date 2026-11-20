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
5. O backend altera a senha em transação, consome o token e revoga as sessões existentes.

## Ativação

Não configure credenciais no Render nem habilite em produção até testar no Preview e no Render staging. Verifique envio, entrega, token expirado/reutilizado, troca de senha e revogação de sessões. O refresh token deve ser tratado como segredo de longa duração e revogado no Google se houver suspeita de exposição.

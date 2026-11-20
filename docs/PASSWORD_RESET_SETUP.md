# Configuração da recuperação de senha (Resend)

A recuperação de senha está implementada na branch `rebuild/v2-security`, mas permanece desativada até que o ambiente receba as credenciais do provedor.

## Variáveis de ambiente do backend

Configure somente no serviço Render de staging:

- `RESEND_API_KEY`: chave de API do Resend (somente no Render; nunca no Git, frontend ou chat).
- `PASSWORD_RESET_FROM_EMAIL`: endereço remetente em um domínio verificado no Resend, por exemplo `NexusDev <seguranca@seudominio.com>`.
- `FRONTEND_URL`: origem HTTPS do Preview Vercel que contém a tela de redefinição.

Não use `onboarding@resend.dev` para recuperação de contas de terceiros: o remetente de teste do Resend só entrega para o endereço associado à própria conta Resend. Para usuários reais, é necessário verificar um domínio controlado pelo projeto e usar um remetente desse domínio.

## Fluxo

1. `POST /api/auth/password-reset/request` recebe o e-mail e sempre retorna uma mensagem genérica para não revelar se a conta existe.
2. O servidor armazena somente o SHA-256 do token aleatório de 256 bits, com validade de 20 minutos.
3. O Resend entrega o link ao endereço cadastrado.
4. A tela do frontend recebe o token pela query string e envia a nova senha para `POST /api/auth/password-reset/confirm`.
5. O backend consome o token uma única vez, altera a senha em transação e revoga todas as sessões. Tokens JWT legados emitidos antes da troca também são rejeitados.

## Ativação segura

Não habilitar em produção antes de testar no Preview e no Render staging com um domínio verificado, confirmar entrega e testar token expirado/reutilizado, troca de senha e revogação de sessões. Não colocar a chave de API em variáveis `VITE_*`.

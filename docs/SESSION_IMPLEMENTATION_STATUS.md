# Implementação de sessões — estado

## Entregue nesta etapa

- Schema separado para sessões por dispositivo e registros individuais de refresh tokens.
- Hash único por refresh token; tokens usados permanecem registrados até a expiração para permitir detecção de replay.
- TTL indexes apenas para limpeza eventual; as consultas também validam explicitamente `expiresAt`.
- Serviço isolado com transação MongoDB para criação e rotação; rotação consome o token anterior e grava o sucessor na mesma transação.
- Reutilização de token já consumido revoga a sessão correspondente com motivo `refresh_replay`.
- Revogação individual e global disponíveis no serviço.

## Restrições e validações pendentes

- O serviço ainda não está ligado ao servidor, login, middleware, cookies ou frontend.
- Transações exigem MongoDB replica set ou cluster compatível; standalone MongoDB não basta.
- Concorrência real, rollback, índices e replay devem ser testados contra MongoDB de staging antes da integração.
- O registro de tokens usados cresce por rotação até a expiração da sessão; a retenção deve ser alinhada à política de sessões e aos índices TTL.
- O TTL index é assíncrono e não substitui as verificações de expiração em cada operação.
- O TTL padrão do serviço é 30 dias, mas ainda é uma constante técnica, não uma política aprovada.
- Não há limite de sessões por usuário nesta etapa.

Nenhuma rota existente foi alterada. Nenhum segredo, banco real, deploy, merge ou produção foi tocado.

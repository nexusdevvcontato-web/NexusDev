# Auditoria das rotas públicas de leitura

## Escopo

Esta etapa revisa:
- `GET /api/leaderboard`
- `GET /api/certificates/:code`
- `GET /api/lessons/:lessonId/comments`

## Controles aplicados

- A consulta pública de certificados tem limite dedicado de 20 requisições por IP a cada 15 minutos.
- Códigos de certificado são normalizados e validados antes da consulta: somente caracteres alfanuméricos e hífen, entre 8 e 100 caracteres. A validação aceita códigos históricos dentro desse formato.
- O leaderboard e a leitura de comentários compartilham limite de 60 requisições por IP a cada 15 minutos, além do limitador global da API.
- A consulta de comentários aceita somente IDs presentes no catálogo oficial de aulas. Cada resposta continua limitada aos 50 comentários mais recentes.
- A projeção pública dos comentários permanece explícita: ID do comentário, autor, badge, data e texto; não inclui e-mail, token ou campos internos do usuário.
- O leaderboard continua limitado a 15 registros e seleciona apenas nome, avatar, XP, sequência e conclusões válidas. A ordenação agora tem desempate determinístico por `_id`; a consulta usa `lean()` para evitar hidratação de documentos Mongoose.

## Dados públicos e privacidade

A validação de certificado continua retornando nome do estudante, contagem de conclusões, XP, data de emissão e links de portfólio. Esses campos são parte do contrato atual consumido pelo verificador público do frontend, mas representam divulgação intencional por quem compartilha o código do certificado. Esta etapa não introduziu um fluxo de consentimento/revogação; isso deve ser tratado como uma decisão de produto e UX antes de ampliar a divulgação pública.

O leaderboard continua publicando nome, avatar, XP, sequência e total de aulas concluídas. Comentários continuam exibindo nome público e badge. Nenhuma dessas respostas deve incluir e-mail, token, senha, papel interno bruto ou dados de autenticação.

## Limitações operacionais

- Os limitadores atuais usam o store em memória padrão do `express-rate-limit`. Em múltiplas instâncias, cada instância terá contadores separados; antes de escalar horizontalmente, configure um store compartilhado (por exemplo Redis).
- A contagem por IP depende da configuração correta de proxy reverso. Não habilite `trust proxy` genericamente; configure apenas os hops/proxies confiáveis da hospedagem.
- Não foram criados índices MongoDB, executadas migrações, consultado banco real ou realizado teste de carga. A query do leaderboard pode exigir índice composto em `xp` e `streak` quando o volume crescer; qualquer criação de índice em produção exige planejamento próprio.
- Os testes desta etapa validam a política pura de entrada. Não são testes HTTP integrados, testes de carga nem prova de configuração de proxy/store em produção.

# Tutor IA — proteção de entrada e abuso

Branch: `rebuild/v2-security`.

- A rota `POST /api/tutor/analyze` aplica rate limit dedicado de 20 requisições por IP a cada 15 minutos, além do limitador global da API.
- O corpo é validado antes da análise. Linguagens permitidas: JavaScript/JS, HTML, CSS, React, Node/NodeJS, Python, SQL e TypeScript/TS.
- Limites: 10 arquivos, 50 KB por arquivo, 100 KB agregados, nomes de arquivo de até 80 caracteres, instruções até 8 KB e até 20 resultados de testes.
- Metadados de testes são limitados a 300 caracteres na descrição e 500 no erro. Arquivos não string, nomes inválidos e chaves de protótipo (`__proto__`, `prototype`, `constructor`) são rejeitados.
- A rota responde HTTP 400 para entradas inválidas e HTTP 429 quando o limite é excedido.
- A rota continua sendo um analisador heurístico determinístico, não uma integração com um provedor de IA. Não executa o código recebido.

## Limitações

- O rate limit padrão usa a identidade IP que o Express recebe. Em staging/produção, a configuração de proxy confiável deve refletir exatamente a infraestrutura real; não habilitar `trust proxy` genericamente.
- Os limites foram cobertos por testes unitários de política. Ainda não houve teste HTTP integrado com MongoDB/proxy real nem teste de carga distribuído.
- Para escalar entre múltiplas instâncias, substituir o armazenamento em memória do rate limiter por um store compartilhado antes de depender de um limite global entre instâncias.
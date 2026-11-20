# Tutor IA — segurança, privacidade e limites operacionais

## Comportamento atual

`POST /api/tutor/analyze` executa análise heurística local na API. A rota não chama um modelo de IA externo nem encaminha o código do estudante a um provedor de IA. Ela retorna dicas baseadas em verificações simples de texto e estrutura.

## Controles implementados

- Limite global da API: 300 requisições por IP a cada 15 minutos.
- Limite específico do Tutor: 20 requisições por IP a cada 15 minutos.
- Corpo JSON limitado a 100 KB.
- Até 10 arquivos por solicitação; 50 KB por arquivo e 100 KB somados.
- Instruções limitadas a 8.000 caracteres.
- Até 20 resultados de testes com descrição de 300 e erro de 500 caracteres.
- Linguagens limitadas a uma allowlist.
- Nomes de arquivo validados e nomes perigosos de propriedades rejeitados.
- Respostas do Tutor usam `Cache-Control: no-store`.
- Os testes de integração cobrem sucesso, entrada inválida, limite de taxa e cabeçalho de não-cache.

## Limitações operacionais conhecidas

O `express-rate-limit` usa o armazenamento em memória padrão neste serviço. Portanto:
- os contadores reiniciam quando o processo reinicia;
- instâncias diferentes não compartilham o mesmo contador;
- o limite é por IP, não por usuário ou conta;
- NAT, redes compartilhadas ou proxies podem agrupar vários estudantes no mesmo IP.

O limite é uma proteção básica contra abuso casual, não uma quota global distribuída nem garantia contra ataques distribuídos. Uma futura implantação com múltiplas instâncias deve adotar um armazenamento compartilhado de rate limit antes de prometer quotas globais. Nenhuma infraestrutura adicional foi criada nesta etapa.

## Privacidade e evolução

O código enviado é processado em memória pela rota atual e não é persistido por ela. Isso não significa que o tráfego esteja livre de logs operacionais em camadas externas de hospedagem; a retenção dos provedores deve ser verificada separadamente.

Se o Tutor passar a usar um provedor de IA externo, essa mudança exige revisão explícita de privacidade, minimização/redação de dados, termos do provedor, retenção, limites de custo e testes de falha. Não reutilizar automaticamente este desenho como autorização para enviar código de alunos a terceiros.

## Estado

Este documento descreve a implementação atual da branch `rebuild/v2-security`; não é uma certificação de conformidade legal nem uma declaração de que a API está pronta para produção.

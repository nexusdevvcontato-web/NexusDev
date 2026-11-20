# Arquitetura proposta do ambiente de staging — NexusDev 2.0

**Status:** desenho técnico; ainda não provisionado nem executado.
**Escopo:** serviço backend isolado no Render, frontend Preview na Vercel e banco de testes separado.
**Regra de segurança:** nenhuma configuração descrita aqui autoriza alterar produção, conectar ao banco real, publicar secrets, migrar dados ou habilitar endpoints incompletos.

## 1. Topologia proposta

```text
Navegador de teste
  |
  | HTTPS — origem Preview da Vercel
  v
Vercel Preview (branch rebuild/v2-security)
  |  /api/* — rewrite externo, sem cache
  v
Render — serviço backend de STAGING
  |
  | MONGO_URI exclusivo
  v
MongoDB — banco/cluster de TESTE isolado
```

A aplicação no navegador deve chamar caminhos relativos `/api/...`. A Vercel encaminhará esses caminhos ao backend de staging. O navegador continuará vendo a origem da Vercel, reduzindo a dependência de cookies de terceiros.

A configuração de rewrite deve ser adicionada somente depois de existir uma URL de staging confirmada. A regra de API deve preceder o fallback SPA para `/index.html`. O destino deve apontar exclusivamente ao host Render de staging; nunca ao host de produção. Não configurar cache para `/api/*`, especialmente respostas autenticadas, refresh, CSRF ou dados pessoais. O backend deve emitir `Cache-Control: no-store` para respostas sensíveis.

## 2. Recursos separados

### Render

Criar um novo Web Service, sem editar o serviço atual:
- Repositório: `nexusdevvcontato-web/NexusDev`.
- Branch: `rebuild/v2-security`.
- URL: host próprio atribuído pelo Render ao serviço de staging.
- Nenhum domínio personalizado necessário.
- Health check: endpoint de saúde não autenticado, depois de confirmar que ele não consulta nem altera dados.
- Logs: não registrar cookies, Authorization, senhas, tokens, códigos OAuth, CSRF ou corpos sensíveis.

O plano gratuito pode suspender serviços inativos e causar cold starts. Isso é aceitável para testes manuais, mas não deve ser confundido com disponibilidade de produção.

### MongoDB

Usar um banco/cluster exclusivo de teste, sem cópia de dados reais:
- URI de staging própria, armazenada apenas no secret manager do Render.
- Usuário de banco exclusivo, com privilégios mínimos sobre o banco de staging.
- Nenhum usuário, senha, certificado ou dado pessoal de produção.
- Não usar a mesma URI de produção com outro nome de variável.
- Não executar scripts de limpeza, seed ou migração até revisar exatamente o alvo.

Preferência: cluster separado. Se isso não for possível, ao menos banco e usuário isolados, com confirmação manual do nome do banco e das permissões antes de conectar.

## 3. Variáveis de ambiente do backend

Configurar no Render de staging, nunca no Git:

| Variável | Valor/critério |
|---|---|
| `NODE_ENV` | `production` para exercitar validações de ambiente de produção |
| `MONGO_URI` | URI exclusiva do banco de staging |
| `JWT_SECRET` | segredo aleatório exclusivo, mínimo 32 caracteres |
| `REAUTH_TOKEN_SECRET` | segredo aleatório exclusivo, mínimo 32 caracteres e diferente de `JWT_SECRET` |
| `CORS_ORIGINS` | origem HTTPS exata e estável do Preview Vercel usado para teste |
| `GOOGLE_CLIENT_ID` | OAuth Client ID de teste, se os fluxos Google forem validados |
| `LESSON_PROOF_PUBLIC_KEY` | manter ausente até haver executor real e chave pública provisionada |

Não copiar secrets da produção. Não colocar valores reais em documentação, issues, commits ou logs.

## 4. Vercel Preview

Manter o projeto Vercel atual e usar Preview deployments da branch `rebuild/v2-security`.
- Confirmar a URL Preview exata atribuída à branch no painel da Vercel.
- Configurar a origem Preview exata em `CORS_ORIGINS` no Render de staging.
- Não usar `*`, curingas ou validação por sufixo.
- Manter `VITE_API_BASE_URL` vazio para que o frontend use caminhos relativos.
- Adicionar rewrite `/api/(.*)` para o host de staging, antes do fallback SPA.
- Garantir que o rewrite preserve o caminho e a query string.
- Não definir cache no rewrite de API; respostas privadas devem continuar `no-store`.
- Não configurar a URL do backend de produção em Preview.

Se a Vercel fornecer URLs Preview diferentes por commit, preferir o alias de Preview estável da branch, caso o projeto o disponibilize e a URL seja confirmada no painel. Caso contrário, atualizar a allowlist com a origem exata do Preview em uso.

## 5. OAuth Google

Se o teste de Google login for necessário:
- Criar/usar um OAuth Client ID separado para staging.
- Autorizar apenas as origens Preview de teste e os redirect URIs estritamente necessários.
- Configurar o mesmo Client ID de staging no backend e no frontend Preview.
- Não reutilizar credenciais OAuth de produção sem uma revisão explícita.
- Se não houver Client ID separado, limitar a primeira rodada aos fluxos de conta local e marcar Google como não testado.

## 6. Sequência de implantação — ainda não autorizada

1. Confirmar no Render a possibilidade de criar um serviço separado conectado à branch de reconstrução.
2. Criar banco de teste e credenciais isoladas.
3. Criar o Web Service de staging com secrets exclusivos.
4. Confirmar health check, logs e URL atribuída.
5. Confirmar a URL Preview estável da branch na Vercel.
6. Configurar allowlist CORS exata no staging.
7. Configurar rewrite Vercel Preview para o backend de staging.
8. Executar smoke tests e testes reais em navegador.
9. Registrar evidências sem segredos e corrigir problemas antes de qualquer decisão sobre produção.

Nenhuma dessas ações externas foi executada nesta etapa.

## 7. Matriz de testes obrigatórios

- API via mesma origem Vercel Preview, confirmando que a URL do navegador permanece sob a origem Vercel.
- Rejeição de Origin ausente, não allowlisted ou semelhante por sufixo.
- Login, renovação de sessão, rotação de refresh, replay, logout e logout-all.
- Cookies: `Secure`, `HttpOnly` no refresh, `Path=/`, sem `Domain`, política `SameSite) aprovada após testes reais.
- CSRF: token vinculado à sessão, header obrigatório, token anterior rejeitado após rotação.
- CORS com credenciais e origem exata; nenhum wildcard.
- Cache: respostas de autenticação, sessão e privacidade com `Cache-Control: no-store`; nenhuma resposta privada servida de cache.
- Falha/restart do backend e indisponibilidade do banco sem fail-open.
- Testes com contas descartáveis; nenhuma conta pessoal ou dado real.
- Verificar logs e ferramentas de rede para garantir ausência de tokens e segredos.

## 8. Critérios de bloqueio

Não avançar para produção se:
- o backend Preview estiver apontando para o banco real;
- o proxy encaminhar qualquer rota para o host de produção;
- cookies não forem persistidos/rotacionados corretamente nos navegadores alvo;
- CSRF ou Origin puderem ser contornados;
- respostas privadas puderem ser armazenadas em cache;
- houver falhas de CI;
- OAuth, sessão ou logout não tiverem sido testados;
- o executor seguro ainda não existir — nesse caso, XP e conclusão verificada continuam bloqueados.

## 9. Limites e decisões pendentes

- O desenho não cria serviço Render, banco, usuário de banco, OAuth Client, secrets ou deploy.
- O middleware CSRF e os primitives de sessão ainda não estão integrados às rotas Express nem ao frontend.
- A arquitetura de autenticação completa por cookie ainda precisa de migração coordenada.
- A política final de `SameSite` depende da topologia e de testes reais.
- O plano gratuito e seus limites devem ser confirmados no painel das plataformas antes do provisionamento.
- Staging não substitui revisão de segurança, privacidade ou jurídica.

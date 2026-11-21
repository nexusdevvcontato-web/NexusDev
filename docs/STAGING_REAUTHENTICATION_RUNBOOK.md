# Runbook de staging — reautenticação recente

**Status (rechecado em 2026-11-21):** o serviço Render `nexusdev-staging-v2` está live no commit de runtime `ed28e216d6bf83f2360f8fa795dda230c6bc2213`; commits posteriores neste ciclo alteraram apenas testes/documentação e não exigiram novo deploy. `REAUTH_TOKEN_SECRET` está provisionado exclusivamente no staging. O smoke test com contas descartáveis e a jornada autenticada completa ainda **não foram executados**; não considerar reautenticação validada end-to-end até concluir as etapas deste roteiro.

## 1. Pré-requisitos

Provisionar em um ambiente de staging isolado:
- `MONGO_URI`: banco de staging, sem dados reais de usuários;
- `JWT_SECRET`: segredo aleatório exclusivo, com pelo menos 32 caracteres;
- `REAUTH_TOKEN_SECRET`: segredo aleatório exclusivo, com pelo menos 32 caracteres, diferente de `JWT_SECRET` (já provisionado somente no serviço Render staging; nunca copiar o valor para este runbook);
- `GOOGLE_CLIENT_ID`: OAuth Client ID de staging;
- `CORS_ORIGINS`: origem exata da prévia frontend de staging.

No frontend:
- configurar a URL da API de staging em `VITE_API_BASE_URL`;
- inserir o mesmo Google Client ID de staging na configuração Google do aplicativo;
- autorizar a origem de staging nas configurações OAuth do Google.

Nunca colocar valores de segredos neste arquivo, em issues, logs, screenshots ou commits. Usar o secret manager da plataforma de staging. Confirmar visualmente e por configuração que nenhuma URL aponta para produção.

## 2. Contas de teste

Criar manualmente duas contas descartáveis:
1. conta local com senha conhecida exclusivamente pela equipe de teste;
2. conta Google de teste com e-mail verificado e identidade Google vinculada à conta.

Não usar credenciais pessoais nem contas reais de usuários. Guardar credenciais no gerenciador seguro da equipe e removê-las após a execução conforme política aprovada.

## 3. Smoke test automatizado para conta local

O repositório contém um smoke test manual com proteções para evitar apontar acidentalmente para produção. Ele exige hostname explicitamente marcado como `staging`, `stage` ou `preview` (ou localhost), HTTPS fora de localhost, e não imprime nem persiste a prova retornada.

Com uma conta local descartável já autenticada no staging, definir as variáveis apenas no terminal seguro/secret manager:
```sh
STAGING_API_URL="https://nexusdev-staging-v2.onrender.com" \
STAGING_ACCESS_TOKEN="<ACCESS_TOKEN_DE_STAGING>" \
STAGING_TEST_PASSWORD="<SENHA_DA_CONTA_DESCARTAVEL>" \
yarn test:staging:reauth
```

O comando testa ausência de autenticação (401), senha incorreta (401), senha correta (200), `Cache-Control: no-store` e validade estrutural/TTL de cinco minutos da prova. A prova é mantida somente em memória e descartada pelo processo. Este smoke test não consome a prova; a rota `GET /api/privacy/export` já consome a prova de forma vinculada à conta, e seu uso/replay/isolamento é coberto separadamente pela suíte HTTP de integração com MongoDB descartável. A validação end-to-end desse caminho no serviço Render staging ainda depende da execução com conta descartável. Não executar com contas reais.

## 4. Testes positivos

Para cada conta, autenticar-se normalmente e obter um access token de staging.

Conta local:
```sh
curl -i -X POST "$STAGING_API/api/auth/reauthenticate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"password":"<SENHA_DA_CONTA_DE_TESTE>"}'
```

Conta Google:
```sh
curl -i -X POST "$STAGING_API/api/auth/reauthenticate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"credential":"<NOVO_GOOGLE_ID_TOKEN>"}'
```

Esperado: HTTP 200, `Cache-Control: no-store`, `reauthToken` e `expiresIn: 300`. Não salvar token em artefatos de CI ou logs. Fazer o teste preferencialmente pela Central de Privacidade, além da chamada HTTP controlada.

## 5. Testes negativos obrigatórios

- sem access token ou access token inválido: HTTP 401;
- segredo `REAUTH_TOKEN_SECRET` ausente: HTTP 503, sem prova;
- senha incorreta, senha vazia ou acima do limite: HTTP 401;
- conta local enviando Google credential: rejeitar;
- conta Google enviando senha: rejeitar;
- token Google expirado, audience incorreta, subject diferente, e-mail diferente ou `email_verified=false`: rejeitar;
- corpo com ambos os campos, campos extras ou formato inválido: HTTP 400;
- token de reautenticação alterado, expirado ou usado por outro usuário: consumo deve falhar;
- consumir a mesma prova duas vezes em chamadas concorrentes: exatamente uma deve conseguir consumir;
- exceder limite de tentativas: rate limit deve responder 429;
- confirmar que respostas e logs não contêm senha, ID token Google ou prova completa.

## 6. Prova de uso único

O backend atualmente armazena apenas o hash do identificador da prova e a expiração no documento do usuário. Validar no staging:
- o token é aceito apenas para o usuário vinculado;
- a expiração é respeitada;
- o consumo atômico remove o hash e a expiração;
- repetição ou concorrência não permite segundo consumo.

Exportação de dados pessoais (`GET /api/privacy/export`) agora exige e consome `X-Reauth-Token` antes de liberar o arquivo. A integração HTTP testa ausência de prova, exportação autorizada, replay negado e isolamento entre contas. A prova não autoriza exclusão de conta nem outras operações.

## 7. Critérios de aprovação

A etapa só pode ser considerada validada quando:
- CI backend e frontend concluírem com sucesso;
- ambos os métodos forem exercitados com credenciais descartáveis reais de staging;
- todos os testes negativos forem aprovados;
- rate limit, CORS, audience Google e consumo concorrente forem verificados;
- logs forem inspecionados sem expor credenciais;
- resultados, versões e evidências sem segredos forem registrados.

## 7A. Evidência automatizada atual

- CI do backend no commit `d43df0ad75ed41155fcdf51727c893af890e7a0e`: aprovada em 2026-11-21, incluindo auditoria de dependências, MongoDB replica set descartável e testes de sintaxe/segurança.
- Execução mais recente: https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44890638522
- Commit imediatamente anterior `43ff149ca72bbf641b84a3c1c55c259d1e4cbd27` também aprovado: https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44890609835
- A integração HTTP com MongoDB descartável cobre reautenticação por senha, prova de cinco minutos, vínculo ao usuário, consumo único, replay negado, concorrência, exportação sem prova rejeitada e isolamento entre duas contas sintéticas. Isso comprova o comportamento no ambiente automatizado, não no serviço Render live.
- O smoke test manual do Render ainda não foi executado porque requer access token e senha de uma conta descartável já criada no staging.
- Essa CI não substitui os testes manuais de staging com contas descartáveis nem comprova o fluxo Google OAuth.

## 8. Limites

Este roteiro não autoriza deploy, migração, conexão com banco de produção, exclusão de contas, revogação de certificados ou habilitação de endpoint destrutivo. A decisão de retenção/revogação de certificados continua pendente.

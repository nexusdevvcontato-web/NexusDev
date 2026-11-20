# Auditoria de privacidade e proteção de dados

## Inventário observado no backend

O documento de usuário armazena:
- Identificação: nome, e-mail, avatar e identidade Google vinculada.
- Autenticação: hash de senha e identificador Google. Nunca devem ser enviados em respostas públicas ou exportações comuns.
- Aprendizagem: XP, sequência, data da última atividade, IDs de aulas concluídas e código salvo por aula.
- Certificado/portfólio: código, data de emissão e URLs GitHub/portfólio.
- Auditoria temporal: `createdAt` e `updatedAt`.

Comentários persistidos contêm ID da aula, nome público do autor, badge, texto e timestamps. O modelo atual não mantém uma referência ao ID do usuário autor; isso limita a capacidade de localizar e apagar comentários de uma conta específica sem risco de atingir comentários de outra pessoa com o mesmo nome.

## Alterações implementadas nesta etapa

### Exportação de dados
- Adicionado `GET /api/privacy/export`, protegido por autenticação.
- A resposta usa allowlist explícita dos dados pertencentes à conta autenticada.
- Inclui dados de perfil, aprendizagem, código salvo, certificado/portfólio e timestamps.
- Exclui `passwordHash`, `googleId`, `__v` e qualquer campo não incluído explicitamente na allowlist.
- A resposta define `Content-Disposition` para JSON e `Cache-Control: no-store`.

### Minimização do JWT
- O JWT de acesso agora contém somente o identificador interno `id`.
- E-mail e papel foram removidos das claims porque o middleware de autenticação recarrega o usuário persistido no MongoDB em cada requisição e não depende dessas claims.
- O hash de senha e o identificador Google nunca são colocados no token.

## Dados divulgados publicamente hoje

- **Leaderboard:** nome, avatar, XP, sequência e total de aulas concluídas.
- **Certificado:** nome, código, total de aulas, XP, data de emissão e URLs de portfólio. O código funciona como identificador público compartilhável; qualquer pessoa que o possua pode consultar esses campos.
- **Comentários:** nome público, badge, data e texto.

Esses dados são divulgados por funcionalidades públicas existentes. Esta etapa não alterou esse contrato para evitar invalidar certificados já emitidos ou quebrar a experiência do ranking/fórum. Antes de ampliar a divulgação, recomenda-se consentimento granular para presença no ranking e para os campos exibidos na validação do certificado.

## Exclusão e retenção: decisões ainda pendentes

Não foi criado endpoint de exclusão automática nesta etapa. O modelo atual não possui vínculo entre comentários e conta, nem política definida para:
- exclusão ou anonimização de comentários após encerramento da conta;
- revogação de certificados públicos e tratamento de cópias já compartilhadas;
- prazo de retenção de código salvo, logs e contas inativas;
- preservação mínima de registros por obrigações legais/segurança;
- tratamento de contas com certificados já emitidos.

Implementar exclusão sem resolver essas regras poderia deixar dados pessoais órfãos ou apagar conteúdo de terceiros. A próxima implementação deve primeiro adicionar referência estável `authorUserId` aos novos comentários e definir uma migração compatível para comentários antigos.

## Limitações e validação

- A exportação cobre os campos do documento de usuário e não inclui logs de infraestrutura, registros de provedores externos ou comentários históricos que não tenham vínculo de autor.
- Os testes unitários verificam a allowlist e a exclusão de segredos; não substituem teste HTTP integrado nem revisão jurídica.
- Não foi acessado banco real, não houve exportação de dados de usuários reais, migração, exclusão, deploy ou alteração de produção.

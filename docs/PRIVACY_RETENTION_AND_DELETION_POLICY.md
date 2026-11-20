# Política técnica de retenção, encerramento e anonimização — NexusDev

**Status:** proposta técnica para revisão; não é parecer jurídico e ainda não autoriza exclusões em produção.  
**Escopo:** backend e dados persistidos pela NexusDev. Dados mantidos diretamente por provedores externos exigem solicitações e prazos próprios.

## 1. Princípios

1. Coletar e manter somente o necessário para as finalidades informadas.
2. Não inferir titularidade a partir de nomes públicos, e-mails escritos em comentários ou semelhança de perfil.
3. Separar encerramento da conta, remoção de conteúdo público e preservação de evidências mínimas.
4. Toda exclusão deve ser autenticada, confirmada pelo titular, auditável e idempotente.
5. Nenhuma rotina de retenção pode apagar dados em lote sem prazo aprovado, monitoramento e procedimento de restauração testado.
6. Não declarar cumprimento de obrigação legal sem avaliação jurídica aplicável à operação e jurisdição.

## 2. Inventário e tratamento proposto

| Categoria | Dados | Tratamento proposto em pedido confirmado |
|---|---|---|
| Identidade e acesso | nome, e-mail, avatar, hash de senha, Google ID | Remover do perfil ativo; invalidar sessões/tokens por remoção da conta. Não exportar credenciais. |
| Aprendizagem | XP, sequência, aulas concluídas, código salvo | Excluir junto com o perfil, salvo necessidade específica e documentada de retenção. |
| Preferências | ranking e detalhes públicos do certificado | Deixar de aplicar após encerramento; o perfil deixa de participar do ranking. |
| Comentários novos vinculados | autorUserId, nome público, badge, texto e datas | Remover o comentário inteiro por padrão para não preservar texto potencialmente pessoal; alternativa de anonimização só após revisão de conteúdo e aprovação explícita da política. |
| Comentários legados sem autorUserId | nome público, badge, texto e datas | Não atribuir automaticamente. Permanecem fora do fluxo automático; tratar somente mediante comprovação individual de autoria ou procedimento editorial documentado. |
| Certificados | código, titular, data, progresso e links | Suspender exposição pública no início do encerramento. A decisão entre revogar e manter certificado anonimizado precisa ser definida antes de ativar exclusão automática. |
| Logs operacionais | logs de aplicação, segurança e infraestrutura | Definir prazo por finalidade e provedor; minimizar identificadores. Não estão cobertos pelo endpoint atual de exportação. |
| Backups e provedores | cópias de banco, logs e dados de serviços externos | Aplicar ciclo documentado do provedor; exclusão imediata em todas as cópias não pode ser prometida sem verificar cada contrato e configuração. |

## 3. Fluxo obrigatório antes de qualquer exclusão

1. **Solicitação:** usuário autenticado abre pedido; o servidor associa o pedido ao ID da sessão, nunca a um ID enviado pelo cliente.
2. **Confirmação de identidade:** exigir reautenticação recente. A implementação atual não possui recuperação/reautenticação de senha nem confirmação equivalente para contas Google; portanto, o endpoint de exclusão permanece bloqueado.
3. **Período de cancelamento:** definir prazo operacional e canal de cancelamento antes de ativar pedidos. Não adotar um prazo arbitrário neste código.
4. **Verificações de retenção:** verificar certificado emitido, comentários legados reclamados e eventual retenção obrigatória documentada.
5. **Execução:** usar operação idempotente, transação quando suportada, registro de auditoria sem guardar conteúdo desnecessário e tratamento de falhas parciais.
6. **Confirmação:** informar o que foi removido, o que foi retido, por qual motivo e o ciclo de expiração dos backups, quando conhecido.

## 4. Certificados: decisão pendente que bloqueia exclusão automática

O código atual permite validação pública por código e pode exibir nome, XP, progresso, data e links. A preferência de visibilidade oculta detalhes, mas não revoga o certificado.

Antes de lançar exclusão de conta, o produto deve escolher uma regra explícita:
- **Revogar:** invalida a consulta pública e mantém somente um marcador mínimo de revogação para impedir que o código volte a validar; ou
- **Preservar anonimamente:** mantém prova mínima de emissão sem nome, perfil, links ou associação recuperável à conta.

A regra escolhida deve ser comunicada antes da confirmação final do usuário. Este documento não escolhe por conta do titular nem altera certificados existentes.

## 5. Comentários legados

Comentários com `authorUserId` podem ser localizados com segurança. Comentários anteriores à implementação desse vínculo não têm prova de autoria. Não usar correspondência por nome, badge ou texto como prova. Um eventual processo de reivindicação deve exigir evidência adicional e revisão antes de alterar conteúdo público.

## 6. Prazos de retenção: não inventar números

Ainda precisam ser definidos, com responsáveis e fundamento:
- prazo de logs de segurança e aplicação;
- prazo de backups e expiração de cópias;
- tratamento de pedidos pendentes e registros de auditoria;
- retenção mínima eventualmente exigida para certificados, prevenção a fraude ou obrigações legais;
- prazos e mecanismos dos provedores externos.

Até que esses prazos sejam aprovados, não implementar job automático de limpeza nem prometer apagamento instantâneo de backups.

## 7. Estado atual e bloqueios técnicos

- Existe exportação autenticada dos dados do perfil e dos comentários com vínculo estável.
- Existe preferência de ocultação do ranking e dos detalhes do certificado.
- Não existe endpoint de exclusão, reautenticação recente, confirmação por canal independente, fluxo de cancelamento, trilha de auditoria de exclusão ou rotina de expiração de backups.
- A conta pode ter certificado emitido; a regra de revogação/preservação ainda não foi escolhida.
- A política de comentários legados ainda depende de decisão editorial.

**Conclusão operacional:** não habilitar exclusão automática nem exclusão de conta na interface até que os bloqueios acima sejam resolvidos e os testes de integração/recuperação sejam aprovados. Esta etapa é documentação e preparação técnica, sem alterar dados reais.


## 8. Máquina de estados preparada (ainda não conectada)

O módulo `src/modules/privacy/deletion-request-state.js` descreve estados permitidos para um futuro pedido: `requested`, `identity_confirmed`, `cooling_off`, `ready_for_execution`, `processing`, `completed`, `cancelled` e `failed`.

- Transições não declaradas são recusadas.
- Preparar ou iniciar execução exige que a barreira `evaluateDeletionReadiness` informe `ready: true`.
- Marcar como concluído exige resultado explícito de execução bem-sucedida.
- Uma falha pode voltar à preparação somente após a prontidão ser restabelecida.
- Cancelamento só é permitido nos estados definidos; depois de iniciado o processamento, não há cancelamento presumido.

Este módulo é uma política de transição pura: não persiste pedidos, não cria endpoint, não agenda prazos e não executa exclusões. A janela de cancelamento real ainda depende de uma duração aprovada e de implementação com relógio confiável.


## Reautenticação recente — base técnica

- A rota autenticada `POST /api/auth/reauthenticate` confirma novamente a credencial do método original: senha com bcrypt para contas locais ou ID token Google verificado no servidor, com `sub`, e-mail e `email_verified` correspondentes à conta já autenticada.
- O endpoint tem limite próprio de tentativas e não registra nem devolve credenciais. Contas Google não podem usar o caminho de senha; contas locais não podem usar uma identidade Google não vinculada.
- A prova resultante usa segredo `REAUTH_TOKEN_SECRET` distinto do segredo de sessão, expira em cinco minutos, é vinculada ao usuário e é armazenada apenas como hash para consumo único por `consumeReauthProof`.
- Sem `REAUTH_TOKEN_SECRET`, o endpoint responde 503 e não emite prova. O segredo é opcional na configuração para não quebrar ambientes existentes, mas deve ser provisionado via secret manager antes de habilitar qualquer fluxo sensível.
- A prova ainda não está conectada a exclusão de conta ou outra ação destrutiva. A futura rota de ação deverá consumir a prova atomicamente e exigir todos os bloqueios de prontidão já definidos. Nenhum pedido ou exclusão é criado por esta implementação.


## 9. Matriz de testes da reautenticação

A validação automatizada da política de credenciais cobre:
- senha correta, incorreta, hash ausente, senha fora do limite e falha do comparador;
- token Google válido, subject divergente, e-mail divergente, e-mail não verificado e falha de verificação;
- tentativa de usar senha em conta Google ou token Google em conta local;
- corpo malformado, campos extras e envio simultâneo de métodos;
- correspondência de e-mail sem distinção de maiúsculas/minúsculas, mantendo a exigência de e-mail verificado.

Esses testes unitários usam verificadores simulados; não substituem a verificação criptográfica real do Google, testes HTTP contra MongoDB de staging, nem validação de cookies/CORS e rate limit no ambiente implantado.

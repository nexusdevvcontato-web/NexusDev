# Testes de integração do Session Store

O teste `test/session-store.mongo.test.js` executa contra MongoDB real somente quando `MONGO_SESSION_TEST_URI` é definido.

Proteções obrigatórias:
- Host deve ser loopback (`localhost`, `127.0.0.1` ou `::1`).
- Banco deve terminar em `_nexusdev_session_test`.
- URI deve declarar `replicaSet`; transações não são suportadas em MongoDB standalone.
- O teste apaga somente o banco explicitamente isolado indicado pela URI, antes e depois da execução.

Exemplo local: `mongodb://127.0.0.1:27017/nexusdev_session_test?replicaSet=rs0`.

Cobertura:
- criação e persistência do hash;
- rotação de token;
- replay serial e revogação;
- duas rotações concorrentes do mesmo token;
- revogação individual e global.

Sem variável de ambiente, a suíte é marcada como ignorada e não abre conexão. Não use URI de staging ou produção.

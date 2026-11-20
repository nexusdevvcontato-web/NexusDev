# Núcleo de refresh tokens — primeira etapa

Este módulo gera refresh tokens opacos com 256 bits de entropia, codificação base64url e hash SHA-256 para persistência. O valor bruto deve ser entregue apenas uma vez ao cliente e nunca persistido, logado ou incluído em URLs.

## Limites desta etapa

- Não existe ainda schema MongoDB de sessão.
- Não há endpoints de login/refresh/logout usando este módulo.
- Não há rotação, detecção de replay ou revogação nesta entrega.
- O login atual e o armazenamento frontend permanecem inalterados.
- Não configure secrets nem altere dados de ambientes.

A comparação de hashes usa `timingSafeEqual` e valida o formato antes da comparação. SHA-256 é adequado aqui porque o token é aleatório e de alta entropia; não é uma senha humana.

Próximas etapas: schema de sessão e serviço de persistência atômica; depois endpoints e integração frontend em staging.

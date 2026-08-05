# Poki SDK — notas de integração

Fonte: https://sdk.poki.com/what-is-p4d (visão geral do P4D) e https://sdk.poki.com/html5.html (guia HTML5).

## Script

```html
<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
```
Incluído no `<head>` de `index.html`, ao lado da CrazyGames SDK. Ambos os scripts funcionam com segurança fora dos seus próprios domínios (modo mock), então o jogo detecta em runtime qual plataforma está ativa.

## API usada neste projeto (`js/game.js`, objeto `SDK`)

- `PokiSDK.init()` — chamado em `SDK.init()`, junto com `CrazyGames.SDK.init()`.
- `PokiSDK.gameLoadingFinished()` — chamado em `SDK.loadingFinished()`, disparado quando o loader some (assets carregados).
- `PokiSDK.gameplayStart()` / `gameplayStop()` — chamados em `SDK.gameplayStart()` / `SDK.gameplayStop()`, junto com os equivalentes da CrazyGames.
- `PokiSDK.commercialBreak(onStart)` / `PokiSDK.rewardedBreak({size, onStart})` — deixados **comentados** em `SDK.midgame()` / `SDK.rewarded()`, mesmo padrão da CrazyGames: anúncios reais só entram quando a monetização for aprovada na Poki. Até lá os callbacks disparam direto (`cb?.()`).

## Detalhes relevantes da documentação

- `commercialBreak()` nem sempre dispara um anúncio de verdade — quem decide o timing é o sistema da Poki. Sinalizar liberalmente nas pausas naturais do jogo.
- Pausar/retomar áudio dentro do callback de início (`onStart`) e da promise resolvida, respectivamente.
- `rewardedBreak()` aceita `size: 'small' | 'medium' | 'large'`.
- Não há API de cloud save na Poki SDK (diferente da CrazyGames `SDK.data`) — o save continua só via CrazyGames + localStorage.

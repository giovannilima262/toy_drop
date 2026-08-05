# Toy Drop (protótipo)

Merge-física estilo Suika com o Kenney Toy Brick Pack, feito para CrazyGames e Poki.

- Solte blocos na caixa; dois iguais se fundem no tamanho seguinte (cadeia: vermelho 1 → amarelo 1 → azul 2 → verde 2 → branco 4 → preto 4 → dourado 6).
- Dois blocos dourados = personagem + confete + 400 pts.
- Game over quando a pilha fica acima da linha por ~1,5 s.

## Rodar

```bash
python3 -m http.server 8741 -d .
# abrir http://localhost:8741
```

## Controles

Arrastar e soltar (toque ou mouse) · setas + espaço no teclado.

## SDKs de plataforma

O jogo carrega as SDKs da CrazyGames e da Poki lado a lado (`index.html`) e o objeto `SDK` em `js/game.js` detecta em runtime qual está ativa, chamando `init`, `gameLoadingFinished`/loading, `gameplayStart`/`gameplayStop` em ambas. Detalhes da integração Poki em [`docs/poki-sdk.md`](docs/poki-sdk.md).

## Pontos de anúncio (simulados no protótipo)

- Interstitial: no "jogar de novo" após game over (`SDK.midgame`).
- Rewarded: botão "chacoalhar" quando a pilha está alta (`SDK.rewarded`).
- Os stubs estão em `js/game.js` no objeto `SDK` — o código real (comentado) para `commercialBreak`/`rewardedBreak` da Poki e `requestAd` da CrazyGames já está lá, só falta ativar quando a monetização for aprovada.

## Debug no console

`TD.drop(tier, x)` · `TD.state()` · `TD.shake()` · `TD.over()` · `TD.restart()`

## Créditos

Sprites: [Kenney Toy Brick Pack](https://kenney.nl) (CC0) — ver KENNEY-LICENSE.txt. Física: matter-js 0.20.

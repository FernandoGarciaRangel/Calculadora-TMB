# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

Calculadora da **taxa metabólica basal** (Mifflin–St Jeor, 1990), uma tela só, em pt-BR.
`index.html` + `tokens.css` + `styles.css` + `app.js`. **Sem build, sem npm, sem dependências** —
o repo inteiro é servido como arquivo estático. Só as fontes (Syne, Nunito) vêm de CDN.

**Em produção: https://calculadora-tmb-five.vercel.app**

Se essa URL sumir daqui, ela está no campo `homepage` do repo no GitHub, preenchido pela
integração da Vercel:

```bash
curl -s https://api.github.com/repos/FernandoGarciaRangel/Calculadora-TMB | grep homepage
```

Não há `.vercel/project.json` local — nunca rodou `vercel link` aqui.

Este repo é um dos que compõem o workspace `D:\REPOS\Apps-Fit`, que **não é um repositório git**.
O que é transversal aos apps está no `CLAUDE.md` da raiz; o sistema de design está em
`../Apps-Hub/DESIGN-SYSTEM.md`.

## Comandos

```bash
npx serve . -l 8081      # a porta é fixa por convenção — ver abaixo

# o smoke do driver é a única suíte deste repo
node .claude/skills/run-calculadora-tmb/driver.mjs smoke
node .claude/skills/run-calculadora-tmb/driver.mjs repl
```

Não há `package.json`: sem `npm install`, sem lint, sem vitest. **Toda a cobertura automatizada
deste app são as 15 checagens do smoke** — se mexer na fórmula, na validação ou no tema, rode-o.
O `SKILL.md` ao lado do driver documenta o REPL e as pegadinhas de pilotagem.

A porta 8081 é fixa porque o `btn-back` reescreve o destino para `http://localhost:8080/` em
`localhost` — o hub precisa estar de pé no 8080. Ver a tabela de portas no `CLAUDE.md` da raiz.

## Arquitetura

`app.js` é uma **IIFE** (`(function () { 'use strict'; … })()`), não um módulo ES: nada é exportado
nem exposto em `window`. Todo o estado do app são duas variáveis de escopo da IIFE — `sexo`
(`'M'`/`'F'`) e `lastSummary` (o texto do "copiar resumo"). Não há framework, roteamento nem
armazenamento; recarregar a página zera tudo menos o tema.

Consequência para quem pilota pelo driver: **não existe handle global para chamar as funções**.
Para exercitar o app, mexa no DOM (`fill`, `click`) como um usuário faria.

### A fórmula e os dois casos de referência

```
TMB = 10×peso(kg) + 6,25×altura(cm) − 5×idade(anos) + (M: +5 | F: −161)
```

O resultado passa por `Math.round` e é formatado com `toLocaleString('pt-BR')` — por isso o
milhar sai com **ponto**. Os casos travados no smoke, conferidos à mão:

| Caso | Conta | Esperado |
|---|---|---|
| M, 82 / 178 / 41 | `820 + 1112,5 − 205 + 5 = 1732,5` | `1.733` |
| F, 68,5 / 165 / 34 | `685 + 1031,25 − 170 − 161 = 1385,25` | `1.385` |

Os 5 níveis de atividade são a constante `fatores` (1,2 a 1,9), multiplicados sobre a TMB **não
arredondada** e renderizados via `innerHTML` em `#act-grid`.

Faixas válidas (`LIMITS`, checadas em `entradasValidas`): peso 20–300 kg, altura 100–250 cm,
idade 1–120 anos. As mesmas faixas estão duplicadas nos `min`/`max` do HTML — mexer numa exige
mexer na outra.

## Pitfall: `type="number"` engole a vírgula decimal

Os três inputs são `type="number"`. Digitar (ou `fill`) `68,5` faz o browser rejeitar o valor e
deixar `.value === ""`, **sem aviso nenhum** — o app então mostra "⚠ Preencha peso, altura e
idade", como se o campo estivesse vazio. Use ponto.

Isto é o **oposto do WeightChartS**, onde `#peso` é `type="text"` justamente para aceitar vírgula
e `WeightApp.parsePeso` normaliza. Dois apps do mesmo workspace, em pt-BR, com convenções
contrárias para o mesmo gesto — vale saber antes de "uniformizar" um dos dois por reflexo. O
comportamento está travado no passo 6 do smoke para que a mudança seja deliberada.

## Outros pontos que escapam

- **`Enter` recalcula de qualquer lugar da página.** Há um `keydown` em `document` que chama
  `calcular()`, com exceção do foco em `#btn-copy` e `#btn-theme` — nesses o Enter já dispara o
  `click` do botão, e recalcular por cima seria duplicado. `e.repeat` também é filtrado.
- **O resultado depende da classe `show` em `#result`.** Cada cálculo remove a classe, força
  reflow (`void box.offsetWidth`) e a repõe, para reiniciar a animação. Ler `#res-val` no instante
  errado pega o valor anterior — espere pelo `show`.
- **O erro usa `style.display`, não `hidden`.** `#err` continua no DOM quando escondido; teste
  pelo `innerText`. Há uma mensagem de faixa só, comum aos três campos, e `aria-invalid` é ligado
  nos três de uma vez.
- **`copiarResultado()` tem dois caminhos**: Clipboard API e, no `catch`, um `<textarea>` fora da
  tela com `execCommand('copy')`. O feedback visível é `#copy-feedback`, que se apaga sozinho em
  2,5 s.

## Sistema de design

`tokens.css` é uma **cópia** de conteúdo idêntico ao dos outros repos; a fonte da verdade é
`../Apps-Hub/DESIGN-SYSTEM.md`. Mudar um token aqui sem mudar lá e nos outros repos quebra a
identidade — e são commits separados, um por repo.

`styles.css` define os tokens locais que o sistema compartilhado não tem (`--card-bg`,
`--card-shadow`, `--result-bg`, `--result-border`, `--item-bg`, `--danger`, `--danger-bg`) e a
camada de componentes. Hex de cor solto fora dessas duas camadas é bug.

**Os nomes de classe aqui divergem da spec.** O sistema define `btn-primary`, `eyebrow`,
`btn-ghost`; este app implementa a mesma anatomia com nomes próprios — `.btn-calc`, `.label-tag`,
`.theme-toggle`, `.sex-toggle`, `.result-box`. Só `card`, `field`, `input-row`, `unit` e
`btn-back` batem com a spec. Não é intencional como decisão de design, é dívida: ao mexer num
componente, siga a **anatomia** da spec (altura ≥44px, `--radius-sm`, `--on-accent` sobre laranja)
mesmo que o nome local seja outro.

As regras de contraste já estão aplicadas e comentadas no CSS — `.sex-toggle button.active` usa
`var(--on-accent)`, não `#fff`, e o laranja de texto (`h1 span`, `.label-tag`, `.formula-row
strong`) usa `--accent-text`. Não reintroduza branco sobre laranja nem `--accent` como cor de
texto.

### O `h1` tem teto em `--step-3`, não `--step-4`

`font-size: clamp(1.25rem, 6.5vw, var(--step-3))`. "Taxa Metabólica" mede **13,27× o font-size**
em Syne 800 — medido, não estimado — então a `--step-4` (2,9rem) precisaria de 615px numa coluna
de 420px. A rampa de `6.5vw` também é o que preserva a quebra desenhada ("Taxa Metabólica" /
"Basal") até 320px de viewport.

Folga real medida com o driver (`fit h1`): 17,8px a 420px · 9,6px a 360px · **4,1px a 320px**. É
apertado. Ao mexer no título ou na escala, meça:

```bash
node .claude/skills/run-calculadora-tmb/driver.mjs repl <<'EOF'
goto /
size 320 700
fit h1
quit
EOF
```

Ao contrário do `h1` do Apps-Hub, este tem `color` sólido — se transbordar, você **vê**. O do hub
usa `background-clip: text` e some calado. Não transporte a paranoia de um para o outro sem
verificar qual é qual.

## Tema

`light`/`dark` em `document.documentElement.dataset.theme`, persistido em `localStorage` sob
`tmb_theme` e aplicado por um script **inline no `<head>`**, antes do CSS — é isso que evita o
flash de tema errado. `applyTheme()` também sincroniza `meta[name="theme-color"]`, o
`aria-pressed`, o `title` e o `aria-label` do botão.

O botão de tema aqui **funciona sem autenticação** (não há Firebase no caminho) — diferente do
WeightChartS, onde `toggleTheme()` aborta sem uid.

## `btn-back` e o hub

O header tem um `<a class="btn-back">` com a URL de produção do hub literal no HTML, e
`apontarBackParaHubLocal()` em `app.js` a reescreve para `http://localhost:8080/` quando
`location.hostname` é exatamente `localhost` ou `127.0.0.1`.

Duas coisas a não inverter:

- **A direção.** O HTML carrega produção e o dev sobrescreve, nunca o contrário — assim qualquer
  falha do script degrada para o comportamento certo em produção.
- **A comparação.** `!==` estrito, não `includes`/`startsWith`: com substring, `localhost.evil.com`
  passaria no teste.

Este app não tem camada de tela cheia, então uma instância no header basta. (No WeightChartS não
basta — ver o `CLAUDE.md` de lá.)

## Deploy

Estático na Vercel, sem variáveis de ambiente, root = `index.html`. Duas falhas silenciosas já
aconteceram neste workspace e valem aqui:

**Maiúsculas/minúsculas.** NTFS ignora, o Linux da Vercel não. Um `href="tokens.css"` apontando
para um arquivo salvo como `Tokens.css` funciona local e some em produção — 404 silencioso, build
verde, página sem estilo. Confira letra por letra.

**Arquivo novo e a referência a ele têm que entrar no mesmo commit**, senão o deploy passa com a
página sem o arquivo.

Depois de um deploy que adicione arquivo, verifique com cache-buster (o browser reporta o CSS
antigo mesmo após recarregar):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://calculadora-tmb-five.vercel.app/tokens.css
curl -s "https://calculadora-tmb-five.vercel.app/tokens.css?v=$RANDOM" | grep on-accent
```

## Idioma

UI, mensagens, comentários e documentação em **português do Brasil**. Repare que o `README.md`
está em português europeu ("ficheiros", "acede", "por omissão"); texto **novo** vai em pt-BR.

## Aviso do produto

A ferramenta é informativa e não substitui acompanhamento médico ou nutricional. O rodapé e o
README dizem isso — não remova esse aviso ao mexer no layout.

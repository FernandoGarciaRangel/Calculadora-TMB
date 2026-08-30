---
name: run-calculadora-tmb
description: Roda, pilota e tira screenshot da Calculadora TMB (taxa metabólica basal, Mifflin-St Jeor, HTML/CSS/JS puro). Use para iniciar/subir o app, abrir em localhost, preencher o formulário, calcular a TMB, testar validação de faixa, tema claro/escuro, capturar tela, rodar o smoke test end-to-end, ou confirmar que uma mudança funciona no app de verdade. Palavras-chave: run, start, dev, serve, screenshot, driver, headless, e2e, smoke, tmb, calculadora.
---

# Rodar e pilotar a Calculadora TMB

Uma tela só: `index.html` + `tokens.css` + `styles.css` + `app.js` (IIFE, sem
módulos). **Sem build, sem npm, sem dependências** — o repo inteiro é servido
como arquivo estático. As fontes (Syne, Nunito) vêm do Google Fonts por CDN; o
resto é local.

O caminho do agente é o **driver**:
`.claude/skills/run-calculadora-tmb/driver.mjs`. Ele sobe um servidor estático,
lança o Chrome headless e fala CDP direto pelo `WebSocket` nativo do Node —
**zero dependências**, nada de Playwright.

Todos os caminhos abaixo são relativos a `CalculadoraTMB/`.

## Pré-requisitos

Só Node ≥ 22 (pelo `WebSocket` global) e o Chrome instalado. Não existe
`package.json` neste repo — não há `npm install`, nem lint, nem testes
unitários; **o smoke do driver é a única suíte que este app tem**. O driver acha
o Chrome sozinho em `C:/Program Files/Google/Chrome/Application/chrome.exe`
(também tenta Program Files (x86), LocalAppData, Edge e os caminhos de Linux);
se estiver noutro lugar, `CHROME=<caminho do exe>`.

## Run (caminho do agente) — comece por aqui

### Smoke test end-to-end

15 checagens: carrega a página, calcula a TMB masculina e a feminina (os dois
ramos do Mifflin), confere os 5 níveis de atividade, testa campo vazio e valor
fora de faixa, prova a pegadinha da vírgula e alterna o tema. Gera 3 screenshots
em `.claude-shots/`.

```bash
node .claude/skills/run-calculadora-tmb/driver.mjs smoke
```

Saída atual: `OK: 15/15 checagens passaram`.

Os dois casos de referência estão com o número conferido à mão — se mexer na
fórmula, é aqui que quebra primeiro:

| Caso | Conta | Esperado |
|---|---|---|
| M, 82 kg / 178 cm / 41 anos | `10×82 + 6,25×178 − 5×41 + 5 = 1732,5` | `1.733` |
| F, 68,5 kg / 165 cm / 34 anos | `685 + 1031,25 − 170 − 161 = 1385,25` | `1.385` |

O arredondamento é `Math.round` e a formatação é `toLocaleString('pt-BR')` —
por isso o esperado tem **ponto** de milhar, não vírgula.

### REPL: um comando por linha no stdin

```bash
node .claude/skills/run-calculadora-tmb/driver.mjs repl <<'EOF'
goto /
fill #peso 82
fill #altura 178
fill #idade 41
click #btn-calc
text #res-val
eval document.querySelectorAll('#act-grid .activity-item').length
click #btn-f
eval document.getElementById('btn-f').getAttribute('aria-pressed')
errors
quit
EOF
```

Saída real desse bloco:

```
ok click #btn-calc {"x":210,"y":704}
ok text "1.733"
ok eval 5
ok click #btn-f {"x":293,"y":302}
ok eval "true"
ok errors 0
```

Cada linha responde `ok …` ou `err …`. Comandos:

| Comando | O que faz |
|---|---|
| `goto <rota>` | navega, espera `load` + 2 frames de raf |
| `click <sel>` | clique real de mouse no centro; **recusa** elemento invisível ou `disabled` |
| `fill <sel> <valor>` | seta `.value` e dispara `input`+`change` |
| `press Enter\|Tab\|Escape` | tecla de verdade |
| `text <sel>` | `innerText` |
| `eval <js>` | avalia (com `await` de promise) e imprime JSON |
| `wait <js>` | espera a expressão virar truthy (8 s) |
| `fit <sel>` | mede largura do texto vs. da caixa |
| `shot <a.png>` / `shotfull <a.png>` | screenshot do viewport / da página inteira |
| `size <w> <h>` | muda o viewport (default 420×900, dsf 2, mobile) |
| `console` / `errors` | despeja o que a página logou / exceções não capturadas |
| `sleep <ms>` / `quit` | |

Screenshots caem em `.claude-shots/` (gitignorado). `OUT_DIR=<dir>` muda.
`HEADFUL=1` abre uma janela de verdade em vez de headless.

### Screenshot rápido

```bash
node .claude/skills/run-calculadora-tmb/driver.mjs shot tmb.png
```

## Gotchas

- **Os inputs são `type="number"`, então vírgula decimal é engolida calada.**
  `fill #peso 68,5` deixa `.value === ""` — o browser rejeita o valor e não
  avisa ninguém. O app então mostra "⚠ Preencha peso, altura e idade", como se o
  campo estivesse vazio. Use ponto: `fill #peso 68.5`. Isto é o **oposto** do
  WeightChartS, onde `#peso` é `type="text"` e `parsePeso` normaliza a vírgula.
  O smoke trava esse comportamento no passo 6, para ninguém "consertar" por
  acidente sem decidir conscientemente.
- **`Enter` recalcula de qualquer lugar da página.** Há um `keydown` global em
  `document` que chama `calcular()`, exceto quando o foco está em `#btn-copy` ou
  `#btn-theme` (nesses, o Enter já dispara o `click` do próprio botão, e
  recalcular por cima seria duplicado). É assim que o smoke recalcula no passo 3.
- **O resultado só aparece com a classe `show` em `#result`.** Depois de
  `click #btn-calc`, espere por ela em vez de ler o texto direto:
  `wait document.getElementById('result').classList.contains('show')`. A
  animação é reiniciada de propósito (`void box.offsetWidth`) a cada cálculo, o
  que significa que a classe some e volta — ler no instante errado pega o valor
  anterior.
- **O erro vai para `#err` com `style.display`, não com `hidden`.** Elemento
  vazio e escondido continua no DOM; teste pelo `innerText`, como o smoke faz.
  As faixas válidas são peso 20–300 kg, altura 100–250 cm, idade 1–120 anos, e
  a mensagem de faixa é uma só para os três campos.
- **`offline` não serve para nada aqui.** O comando existe no driver (é o mesmo
  harness dos três apps) e bloqueia CDN e endpoints do Firebase. Esta
  calculadora não usa Firebase; o comando roda, responde `ok` e não muda nada.
- **`copiarResultado()` usa a Clipboard API** e cai num `<textarea>` +
  `execCommand('copy')` quando ela não existe. Em headless sem permissão de
  clipboard o caminho principal pode rejeitar; o fallback é que sustenta o
  teste. Para verificar o conteúdo copiado sem depender disso, leia
  `#copy-feedback` (o texto "Copiado para a área de transferência." dura 2,5 s).
- **O tema é `tmb_theme` no `localStorage`**, aplicado por um script inline no
  `<head>` antes do CSS. Cada `launch` cria um perfil de Chrome novo em
  `%TEMP%`, então o `localStorage` começa vazio e o tema inicial é sempre
  `dark`. Diferente do WeightChartS, aqui o botão de tema **funciona** sem
  autenticar — não há Firebase no caminho.
- **`shotfull` pinta elementos `fixed`/`sticky` na altura do viewport**, não no
  topo da imagem. Para um screenshot limpo do topo, use `shot`.

## Troubleshooting

| Sintoma | Causa / correção |
|---|---|
| "⚠ Preencha peso, altura e idade" com o campo preenchido | Vírgula decimal num `input[type=number]`. Use ponto. |
| `#res-val` com o valor do cálculo anterior | Leu antes do `show`. Use `wait … classList.contains('show')`. |
| TMB fora do esperado por ~166 | Sexo errado: o ramo feminino é `−161` e o masculino `+5`. Cheque `#btn-f`/`#btn-m` e o `aria-pressed`. |
| Tudo responde `forbidden` / página em branco | `APP_DIR` com barras trocadas. O driver normaliza com `path.resolve`; se sobrescrever à mão, passe caminho absoluto. |
| `Chrome não encontrado` | `CHROME=<caminho do chrome.exe>`. |
| `Chrome não abriu a porta de debug em 20000ms` | Sobrou um Chrome do driver travado: `taskkill //F //IM chrome.exe` (fecha o seu browser também) ou reinicie. |

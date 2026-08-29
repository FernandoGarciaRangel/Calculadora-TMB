# Calculadora TMB

Calculadora web da **taxa metabólica basal (TMB)** com duas equações à escolha: **Mifflin–St Jeor** (1990) e **Harris–Benedict** (revisada em 1984). Interface em português (pt-BR), temas escuro e claro, e estimativas de gasto energético por nível de atividade física.

**App online:** [calculadora-tmb-five.vercel.app](https://calculadora-tmb-five.vercel.app/)

## Funcionalidades

- Escolha da fórmula — **Mifflin–St Jeor** ou **Harris–Benedict** — com um resumo de quando usar cada uma e a escolha guardada entre visitas
- Cálculo da TMB com base em sexo, peso (kg), altura (cm) e idade (anos)
- Validação dos intervalos: peso 20–300 kg, altura 100–250 cm, idade 1–120 anos
- Lista de **gasto diário estimado** com multiplicadores de atividade (sedentário a atleta)
- Detalhe do cálculo intermédio na própria página
- **Copiar resumo** (TMB + dados e gastos por atividade) para a área de transferência

## Stack

- HTML5, CSS3 (`tokens.css` + `styles.css`) e JavaScript vanilla em `app.js` (sem build nem dependências npm)
- Fontes: [Google Fonts](https://fonts.google.com/) (Nunito, Syne)

## Como usar localmente

1. Clona o repositório ou descarrega os ficheiros.
2. Abre `index.html` no navegador **ou** serve a pasta com um servidor estático, por exemplo:

```bash
npx serve . -l 8081
```

Depois acede a `http://localhost:8081`.

A porta e fixa de proposito. Os tres apps do workspace tem portas proprias para
poderem estar de pe ao mesmo tempo — e o botao **← Apps** so consegue navegar
para o hub local se o hub estiver no lugar esperado:

| App | Porta | Comando |
|---|---|---|
| Apps-Hub | 8080 | `npx serve . -l 8080` |
| Calculadora TMB | 8081 | `npx serve . -l 8081` |
| WeightChartS | 3000 | `npm run dev` |

Em `localhost` ou `127.0.0.1`, o **← Apps** aponta para `http://localhost:8080/`;
em qualquer outro host, para o hub em producao.

## Deploy (Vercel)

O projeto é estático: basta apontar o repositório para um projeto na [Vercel](https://vercel.com/) com as definições por omissão (ficheiro de entrada na raiz: `index.html`).

Implementação atual: **https://calculadora-tmb-five.vercel.app/**

## Fórmulas (referência)

Em unidades métricas: peso em kg, altura em cm, idade em anos.

### Mifflin–St Jeor (1990) — padrão

- **Homens:** `TMB = 10 × peso + 6,25 × altura − 5 × idade + 5`
- **Mulheres:** `TMB = 10 × peso + 6,25 × altura − 5 × idade − 161`

Referência: Mifflin MD, St Jeor ST, et al. — *J Am Diet Assoc.* 1990.

### Harris–Benedict (revisada, 1984)

- **Homens:** `TMB = 88,362 + 13,397 × peso + 4,799 × altura − 5,677 × idade`
- **Mulheres:** `TMB = 447,593 + 9,247 × peso + 3,098 × altura − 4,330 × idade`

Referência: Roza AM, Shizgal HM — *Am J Clin Nutr.* 1984 (revisão da equação
original de Harris & Benedict, 1919).

### Qual escolher

- **Mifflin–St Jeor** é a escolha padrão: mais precisa para a maioria dos adultos
  saudáveis e continua confiável com sobrepeso e obesidade.
- **Harris–Benedict** é a clássica, ainda presente em planos e tabelas antigas.
  Tende a superestimar a TMB (tipicamente 5–15% acima), sobretudo com mais gordura
  corporal — útil quando é preciso comparar com um cálculo já feito por ela.

As duas partem apenas de peso, altura, idade e sexo: nenhuma mede composição
corporal. Convém escolher uma e manter a mesma ao acompanhar a evolução.

## Aviso

Esta ferramenta é apenas **informativa** e não substitui acompanhamento médico ou nutricional. Valores individuais podem variar (composição corporal, medicamentos, condições de saúde, etc.).

## Licença

Este projeto está sob a licença MIT — ver o ficheiro [LICENSE](LICENSE).

## Autor

**Fernando Garcia Rangel**

# Calculadora TMB

Calculadora web da **taxa metabólica basal (TMB)** com a equação **Mifflin–St Jeor** (1990). Interface em português (pt-BR), temas escuro e claro, e estimativas de gasto energético por nível de atividade física.

**App online:** [calculadora-tmb-five.vercel.app](https://calculadora-tmb-five.vercel.app/)

## Funcionalidades

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

## Fórmula (referência)

Equação de **Mifflin–St Jeor** em unidades métricas:

- **Homens:** `TMB = 10 × peso(kg) + 6,25 × altura(cm) − 5 × idade(anos) + 5`
- **Mulheres:** `TMB = 10 × peso(kg) + 6,25 × altura(cm) − 5 × idade(anos) − 161`

Referência: Mifflin MD, St Jeor ST, et al. — *J Am Diet Assoc.* 1990.

## Aviso

Esta ferramenta é apenas **informativa** e não substitui acompanhamento médico ou nutricional. Valores individuais podem variar (composição corporal, medicamentos, condições de saúde, etc.).

## Licença

Este projeto está sob a licença MIT — ver o ficheiro [LICENSE](LICENSE).

## Autor

**Fernando Garcia Rangel**

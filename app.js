(function () {
  'use strict';

  let sexo = 'M';
  let formulaId = 'mifflin';
  let lastSummary = '';

  const LIMITS = { peso: [20, 300], altura: [100, 250], idade: [1, 120] };

  // As duas equações têm a mesma forma — uma constante mais um coeficiente por
  // medida —, então basta guardar os coeficientes e um único cálculo serve para
  // ambas. `baseFirst` é só apresentação: na Harris-Benedict a literatura sempre
  // escreve a constante à frente, e quem confere a conta procura por ela ali.
  const FORMULAS = {
    mifflin: {
      id: 'mifflin',
      nome: 'Mifflin-St Jeor',
      subtitulo: 'Fórmula de Mifflin-St Jeor · 1990',
      fonte: 'Mifflin MD, St Jeor ST, et al. — J Am Diet Assoc. 1990',
      baseFirst: false,
      coef: {
        M: { base: 5, peso: 10, altura: 6.25, idade: -5 },
        F: { base: -161, peso: 10, altura: 6.25, idade: -5 },
      },
    },
    harris: {
      id: 'harris',
      nome: 'Harris-Benedict',
      subtitulo: 'Fórmula de Harris-Benedict · revisada em 1984',
      fonte: 'Roza AM, Shizgal HM — Am J Clin Nutr. 1984 (revisão de Harris & Benedict, 1919)',
      baseFirst: true,
      coef: {
        M: { base: 88.362, peso: 13.397, altura: 4.799, idade: -5.677 },
        F: { base: 447.593, peso: 9.247, altura: 3.098, idade: -4.330 },
      },
    },
  };

  const fatores = [
    { nome: 'Sedentário (sem exercício)', fat: 1.2 },
    { nome: 'Levemente ativo (1–3x/sem)', fat: 1.375 },
    { nome: 'Moderadamente ativo (3–5x/sem)', fat: 1.55 },
    { nome: 'Muito ativo (6–7x/sem intenso)', fat: 1.725 },
    { nome: 'Extremamente ativo (atleta / 2x/dia)', fat: 1.9 },
  ];

  function fmtPt(n) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // Os coeficientes da Harris-Benedict têm três casas (13,397) — arredondá-los a
  // duas mostraria uma conta diferente da que foi feita.
  function fmtCoef(n) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }

  function formulaAtiva() {
    return FORMULAS[formulaId] || FORMULAS.mifflin;
  }

  function calcularTmb(f, s, peso, altura, idade) {
    const c = f.coef[s];
    return c.base + c.peso * peso + c.altura * altura + c.idade * idade;
  }

  // Junta os termos com + / − a partir do sinal de cada um; o primeiro só leva
  // sinal se for negativo.
  function juntarTermos(itens) {
    return itens.map(function (it, i) {
      if (i === 0) return (it.n < 0 ? '−' : '') + it.txt;
      return (it.n < 0 ? ' − ' : ' + ') + it.txt;
    }).join('');
  }

  function detalheCalculo(f, s, peso, altura, idade, tmb) {
    const c = f.coef[s];
    const medidas = [
      { coef: c.peso, valor: peso },
      { coef: c.altura, valor: altura },
      { coef: c.idade, valor: idade },
    ];

    const expr = medidas.map(function (m) {
      return { n: m.coef, txt: '(' + fmtCoef(Math.abs(m.coef)) + ' × ' + fmtPt(m.valor) + ')' };
    });
    const prod = medidas.map(function (m) {
      return { n: m.coef, txt: fmtPt(Math.abs(m.coef * m.valor)) };
    });
    const base = { n: c.base, txt: fmtCoef(Math.abs(c.base)) };

    const linhaExpr = f.baseFirst ? [base].concat(expr) : expr.concat([base]);
    const linhaProd = f.baseFirst ? [base].concat(prod) : prod.concat([base]);

    return '<strong>Cálculo:</strong> ' + juntarTermos(linhaExpr) + '<br>' +
      '= ' + juntarTermos(linhaProd) + ' = ' + fmtPt(tmb) +
      ' → <strong>' + Math.round(tmb) + ' kcal</strong>';
  }

  function entradasValidas(peso, altura, idade) {
    if (!Number.isFinite(peso) || !Number.isFinite(altura) || !Number.isFinite(idade)) return false;
    const [pMin, pMax] = LIMITS.peso;
    const [aMin, aMax] = LIMITS.altura;
    const [iMin, iMax] = LIMITS.idade;
    return peso >= pMin && peso <= pMax && altura >= aMin && altura <= aMax && idade >= iMin && idade <= iMax;
  }

  function mensagemErro(peso, altura, idade, rawPeso, rawAltura, rawIdade) {
    if (!rawPeso || !rawAltura || !rawIdade) {
      return '⚠ Preencha peso, altura e idade.';
    }
    if (!Number.isFinite(peso) || !Number.isFinite(altura) || !Number.isFinite(idade)) {
      return '⚠ Use apenas números válidos nos campos.';
    }
    return '⚠ Use peso (20–300 kg), altura (100–250 cm) e idade (1–120 anos).';
  }

  function resultadoVisivel() {
    return document.getElementById('result').classList.contains('show');
  }

  function setSex(s) {
    sexo = s;
    document.getElementById('btn-m').classList.toggle('active', s === 'M');
    document.getElementById('btn-f').classList.toggle('active', s === 'F');
    document.getElementById('btn-m').setAttribute('aria-pressed', s === 'M');
    document.getElementById('btn-f').setAttribute('aria-pressed', s === 'F');
    // Sem recalcular, ficaria na tela um número que já não corresponde aos controles.
    if (resultadoVisivel()) calcular();
  }

  // —— Fórmula ——
  const FORMULA_KEY = 'tmb_formula';

  function setFormula(id, recalcular) {
    formulaId = FORMULAS[id] ? id : 'mifflin';
    const f = formulaAtiva();

    const btnMifflin = document.getElementById('btn-mifflin');
    const btnHarris = document.getElementById('btn-harris');
    btnMifflin.classList.toggle('active', f.id === 'mifflin');
    btnHarris.classList.toggle('active', f.id === 'harris');
    btnMifflin.setAttribute('aria-pressed', f.id === 'mifflin');
    btnHarris.setAttribute('aria-pressed', f.id === 'harris');

    document.getElementById('subtitle').textContent = f.subtitulo;
    document.getElementById('footer-ref').textContent = f.fonte;
    document.getElementById('res-formula').textContent = f.nome;

    if (recalcular && resultadoVisivel()) calcular();
  }

  function escolherFormula(id) {
    setFormula(id, true);
    try {
      localStorage.setItem(FORMULA_KEY, formulaId);
    } catch (e) { /* localStorage indisponível — a escolha vale só nesta sessão */ }
  }

  function setInputsInvalid(invalid) {
    ['peso', 'altura', 'idade'].forEach(function (id) {
      document.getElementById(id).setAttribute('aria-invalid', invalid ? 'true' : 'false');
    });
  }

  function calcular() {
    const elPeso = document.getElementById('peso');
    const elAlt = document.getElementById('altura');
    const elIdade = document.getElementById('idade');
    const rawPeso = elPeso.value.trim();
    const rawAltura = elAlt.value.trim();
    const rawIdade = elIdade.value.trim();

    const peso = parseFloat(rawPeso);
    const altura = parseFloat(rawAltura);
    const idade = parseFloat(rawIdade);
    const err = document.getElementById('err');

    if (!entradasValidas(peso, altura, idade)) {
      err.textContent = mensagemErro(peso, altura, idade, rawPeso, rawAltura, rawIdade);
      err.style.display = 'block';
      document.getElementById('result').classList.remove('show');
      setInputsInvalid(true);
      lastSummary = '';
      return;
    }
    err.style.display = 'none';
    setInputsInvalid(false);

    const f = formulaAtiva();
    const tmb = calcularTmb(f, sexo, peso, altura, idade);
    const tmbR = Math.round(tmb);

    document.getElementById('res-val').textContent = tmbR.toLocaleString('pt-BR');
    document.getElementById('formula-detail').innerHTML =
      detalheCalculo(f, sexo, peso, altura, idade, tmb);

    const linhasAtividade = fatores.map(function (fa) {
      const kcal = Math.round(tmb * fa.fat).toLocaleString('pt-BR');
      return '<div class="activity-item">' +
        '<span class="act-name">' + fa.nome + '</span>' +
        '<span class="act-val">' + kcal + ' kcal</span>' +
        '</div>';
    });

    document.getElementById('act-grid').innerHTML = linhasAtividade.join('');

    const sexoLabel = sexo === 'M' ? 'Masculino' : 'Feminino';
    lastSummary = [
      'Calculadora TMB — ' + f.nome,
      'TMB: ' + tmbR.toLocaleString('pt-BR') + ' kcal/dia',
      'Sexo: ' + sexoLabel + ' | Peso: ' + fmtPt(peso) + ' kg | Altura: ' + fmtPt(altura) + ' cm | Idade: ' + String(idade) + ' anos',
      '',
      'Gasto estimado por atividade:',
    ].concat(
      fatores.map(function (fa) {
        return '• ' + fa.nome + ': ' + Math.round(tmb * fa.fat).toLocaleString('pt-BR') + ' kcal';
      })
    ).join('\n');

    const box = document.getElementById('result');
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
  }

  function showCopyFeedback() {
    var el = document.getElementById('copy-feedback');
    el.textContent = 'Copiado para a área de transferência.';
    window.clearTimeout(showCopyFeedback._t);
    showCopyFeedback._t = window.setTimeout(function () {
      el.textContent = '';
    }, 2500);
  }

  function copiarResultado() {
    if (!lastSummary) return;
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = lastSummary;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showCopyFeedback();
      } finally {
        document.body.removeChild(ta);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastSummary).then(showCopyFeedback).catch(fallback);
    } else {
      fallback();
    }
  }

  // —— Tema —— (o valor inicial já foi aplicado pelo script inline no <head>)
  const THEME_KEY = 'tmb_theme';

  function temaAtual() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#fafafa' : '#09090b';

    const btn = document.getElementById('btn-theme');
    btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    btn.title = t === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
    btn.setAttribute('aria-label', btn.title);
  }

  function alternarTema() {
    const proximo = temaAtual() === 'light' ? 'dark' : 'light';
    applyTheme(proximo);
    try {
      localStorage.setItem(THEME_KEY, proximo);
    } catch (e) { /* localStorage indisponível — o tema vale só nesta sessão */ }
  }

  // Em dev, o btn-back aponta para o hub local em vez de producao.
  // A direcao importa: o HTML carrega a URL de producao literal e so aqui ela
  // e reescrita. Se este script falhar ou o JS estiver desligado, degrada para
  // o comportamento correto em producao, que e o unico que o usuario ve.
  // Portas fixas do workspace: hub 8080, esta calculadora 8081, WeightChartS 3000.
  function apontarBackParaHubLocal() {
    const h = location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') return;
    document.querySelectorAll('.btn-back').forEach(function (el) {
      el.href = 'http://localhost:8080/';
    });
  }

  apontarBackParaHubLocal();

  document.getElementById('btn-m').addEventListener('click', function () { setSex('M'); });
  document.getElementById('btn-f').addEventListener('click', function () { setSex('F'); });
  document.getElementById('btn-mifflin').addEventListener('click', function () { escolherFormula('mifflin'); });
  document.getElementById('btn-harris').addEventListener('click', function () { escolherFormula('harris'); });
  document.getElementById('btn-calc').addEventListener('click', calcular);
  document.getElementById('btn-copy').addEventListener('click', copiarResultado);
  document.getElementById('btn-theme').addEventListener('click', alternarTema);

  // Sincroniza aria-pressed/title com o tema que o <head> ja aplicou.
  applyTheme(temaAtual());

  // A fórmula, ao contrário do tema, não muda cor nenhuma antes da pintura —
  // pode ser restaurada aqui mesmo, sem script no <head>.
  var formulaSalva = null;
  try {
    formulaSalva = localStorage.getItem(FORMULA_KEY);
  } catch (e) { /* localStorage indisponível — abre na fórmula padrão */ }
  setFormula(formulaSalva || 'mifflin', false);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.repeat) return;
    // Enter num botao ja dispara o click dele — nao recalcular por cima.
    if (e.target && e.target.tagName === 'BUTTON' && e.target.id !== 'btn-calc') return;
    calcular();
  });
})();

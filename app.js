(function () {
  'use strict';

  let sexo = 'M';
  let lastSummary = '';

  const LIMITS = { peso: [20, 300], altura: [100, 250], idade: [1, 120] };

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

  function setSex(s) {
    sexo = s;
    document.getElementById('btn-m').classList.toggle('active', s === 'M');
    document.getElementById('btn-f').classList.toggle('active', s === 'F');
    document.getElementById('btn-m').setAttribute('aria-pressed', s === 'M');
    document.getElementById('btn-f').setAttribute('aria-pressed', s === 'F');
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

    const termPeso = 10 * peso;
    const termAlt = 6.25 * altura;
    const termIdade = 5 * idade;
    const base = termPeso + termAlt - termIdade;
    const tmb = sexo === 'M' ? base + 5 : base - 161;
    const tmbR = Math.round(tmb);

    document.getElementById('res-val').textContent = tmbR.toLocaleString('pt-BR');

    const ajusteTxt = sexo === 'M' ? '+ 5' : '− 161';
    const ajusteCompacto = sexo === 'M' ? '+5' : '−161';
    document.getElementById('formula-detail').innerHTML =
      '<strong>Cálculo:</strong> (10 × ' + fmtPt(peso) + ') + (6,25 × ' + fmtPt(altura) + ') − (5 × ' + fmtPt(idade) + ') ' + ajusteCompacto + '<br>' +
      '= ' + fmtPt(termPeso) + ' + ' + fmtPt(termAlt) + ' − ' + fmtPt(termIdade) + ' ' + ajusteTxt + ' = ' + fmtPt(tmb) + ' → <strong>' + tmbR + ' kcal</strong>';

    const linhasAtividade = fatores.map(function (f) {
      const kcal = Math.round(tmb * f.fat).toLocaleString('pt-BR');
      return '<div class="activity-item">' +
        '<span class="act-name">' + f.nome + '</span>' +
        '<span class="act-val">' + kcal + ' kcal</span>' +
        '</div>';
    });

    document.getElementById('act-grid').innerHTML = linhasAtividade.join('');

    const sexoLabel = sexo === 'M' ? 'Masculino' : 'Feminino';
    lastSummary = [
      'Calculadora TMB — Mifflin-St Jeor',
      'TMB: ' + tmbR.toLocaleString('pt-BR') + ' kcal/dia',
      'Sexo: ' + sexoLabel + ' | Peso: ' + fmtPt(peso) + ' kg | Altura: ' + fmtPt(altura) + ' cm | Idade: ' + String(idade) + ' anos',
      '',
      'Gasto estimado por atividade:',
    ].concat(
      fatores.map(function (f) {
        return '• ' + f.nome + ': ' + Math.round(tmb * f.fat).toLocaleString('pt-BR') + ' kcal';
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

  document.getElementById('btn-m').addEventListener('click', function () { setSex('M'); });
  document.getElementById('btn-f').addEventListener('click', function () { setSex('F'); });
  document.getElementById('btn-calc').addEventListener('click', calcular);
  document.getElementById('btn-copy').addEventListener('click', copiarResultado);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.repeat) return;
    if (e.target && e.target.id === 'btn-copy') return;
    calcular();
  });
})();

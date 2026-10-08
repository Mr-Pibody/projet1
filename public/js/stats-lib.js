// ============================================
// LIBRAIRIE STATISTIQUE PARTAGÉE - calculs côté client
// ============================================

const StatsLib = (function () {

  // ---- Fonctions utilitaires ----
  function erf(x) {
    // approximation d'Abramowitz-Stegun
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  function normCdf(z) { return 0.5 * (1 + erf(z / Math.sqrt(2))); }

  // approximation de l'inverse de la CDF normale (Beasley-Springer-Moro simplifié)
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5; r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }

  // ---- 1. Taille d'échantillon (Cohen) ----
  function sampleSizeTwoProportions(p1, p2, alpha, power) {
    const zAlpha = normInv(1 - alpha / 2);
    const zBeta = normInv(power);
    const pBar = (p1 + p2) / 2;
    const n = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p1 - p2, 2);
    return Math.ceil(n);
  }

  function sampleSizeMeans(d, alpha, power) {
    // d = taille d'effet de Cohen standardisée
    const zAlpha = normInv(1 - alpha / 2);
    const zBeta = normInv(power);
    const n = (2 * Math.pow(zAlpha + zBeta, 2)) / Math.pow(d, 2);
    return Math.ceil(n);
  }

  // ---- 2. Kaplan-Meier ----
  function kaplanMeier(data) {
    // data = [{ time, event }] event: 1=événement, 0=censuré
    const sorted = [...data].sort((a, b) => a.time - b.time);
    const times = [...new Set(sorted.map(d => d.time))].sort((a, b) => a - b);
    let atRisk = sorted.length;
    let survival = 1;
    const points = [{ time: 0, survival: 1, ciLow: 1, ciHigh: 1 }];
    let varSum = 0;

    times.forEach(t => {
      const atT = sorted.filter(d => d.time === t);
      const events = atT.filter(d => d.event === 1).length;
      const atRiskNow = sorted.filter(d => d.time >= t).length;
      if (events > 0) {
        const factor = (atRiskNow - events) / atRiskNow;
        survival *= factor;
        if (atRiskNow > events) varSum += events / (atRiskNow * (atRiskNow - events));
      }
      const se = survival * Math.sqrt(varSum); // Greenwood
      points.push({
        time: t,
        survival: survival,
        ciLow: Math.max(0, survival - 1.96 * se),
        ciHigh: Math.min(1, survival + 1.96 * se)
      });
    });
    return points;
  }

  // ---- 3. Incidence cumulée / Aalen-Johansen simplifié (2 causes) ----
  function aalenJohansen(data) {
    // data = [{ time, status }] status: 0=censuré, 1=cause1, 2=cause2
    const sorted = [...data].sort((a, b) => a.time - b.time);
    const times = [...new Set(sorted.map(d => d.time))].sort((a, b) => a - b);
    let survival = 1;
    let cif1 = 0, cif2 = 0;
    const points = [{ time: 0, cif1: 0, cif2: 0, survival: 1 }];

    times.forEach(t => {
      const atRisk = sorted.filter(d => d.time >= t).length;
      const e1 = sorted.filter(d => d.time === t && d.status === 1).length;
      const e2 = sorted.filter(d => d.time === t && d.status === 2).length;
      const totalEvents = e1 + e2;

      if (totalEvents > 0 && atRisk > 0) {
        cif1 += survival * (e1 / atRisk);
        cif2 += survival * (e2 / atRisk);
        survival *= (1 - totalEvents / atRisk);
      }
      points.push({ time: t, cif1, cif2, survival });
    });
    return points;
  }

  // ---- 4. Régression linéaire simple ----
  function linearRegression(xs, ys) {
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
    const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
    const sumY2 = ys.reduce((acc, y) => acc + y * y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    const ssTot = ys.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
    const ssRes = ys.reduce((acc, y, i) => acc + Math.pow(y - (slope * xs[i] + intercept), 2), 0);
    const r2 = 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }

  // ---- Calculatrice scientifique : parser d'expressions sécurisé (sans eval) ----
  function evaluateExpression(expr) {
    // Tokenizer
    const tokens = expr.match(/(\d+\.?\d*|\+|\-|\*|\/|\^|\(|\)|sin|cos|tan|log|ln|sqrt|pi|e|asin|acos|atan)/g);
    if (!tokens) throw new Error('Expression invalide');
    let pos = 0;

    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }

    function parseExpression() {
      let val = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = next();
        const rhs = parseTerm();
        val = op === '+' ? val + rhs : val - rhs;
      }
      return val;
    }
    function parseTerm() {
      let val = parseFactor();
      while (peek() === '*' || peek() === '/') {
        const op = next();
        const rhs = parseFactor();
        val = op === '*' ? val * rhs : val / rhs;
      }
      return val;
    }
    function parseFactor() {
      let val = parseUnary();
      while (peek() === '^') {
        next();
        const rhs = parseUnary();
        val = Math.pow(val, rhs);
      }
      return val;
    }
    function parseUnary() {
      if (peek() === '-') { next(); return -parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      const tok = next();
      if (tok === '(') {
        const val = parseExpression();
        if (peek() === ')') next();
        return val;
      }
      if (tok === 'pi') return Math.PI;
      if (tok === 'e') return Math.E;
      if (['sin','cos','tan','log','ln','sqrt','asin','acos','atan'].includes(tok)) {
        let arg;
        if (peek() === '(') { next(); arg = parseExpression(); if (peek() === ')') next(); }
        else arg = parseUnary();
        switch (tok) {
          case 'sin': return Math.sin(arg);
          case 'cos': return Math.cos(arg);
          case 'tan': return Math.tan(arg);
          case 'asin': return Math.asin(arg);
          case 'acos': return Math.acos(arg);
          case 'atan': return Math.atan(arg);
          case 'log': return Math.log10(arg);
          case 'ln': return Math.log(arg);
          case 'sqrt': return Math.sqrt(arg);
        }
      }
      return parseFloat(tok);
    }

    const result = parseExpression();
    if (pos < tokens.length) throw new Error('Expression invalide');
    return result;
  }

  return {
    sampleSizeTwoProportions, sampleSizeMeans,
    kaplanMeier, aalenJohansen,
    linearRegression,
    evaluateExpression,
    normCdf, normInv
  };
})();

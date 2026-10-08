// ============================================
// PARSER D'EXPRESSIONS AVEC VARIABLE x
// Utilisé par le projet "Calculatrice scientifique" (mode étude de fonction)
// Séparé de stats-lib.js pour ne pas modifier le parser existant (calculatrice simple, sans variable)
// ============================================

const FunctionLib = (function () {

  function evaluateAt(expr, xValue) {
    const tokens = expr.match(/(\d+\.?\d*|\+|\-|\*|\/|\^|\(|\)|x|sin|cos|tan|log|ln|sqrt|abs|pi|e|asin|acos|atan)/g);
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
      if (tok === undefined) throw new Error('Expression incomplète');
      if (tok === '(') {
        const val = parseExpression();
        if (peek() === ')') next();
        return val;
      }
      if (tok === 'x') return xValue;
      if (tok === 'pi') return Math.PI;
      if (tok === 'e') return Math.E;
      if (['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'abs', 'asin', 'acos', 'atan'].includes(tok)) {
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
          case 'abs': return Math.abs(arg);
        }
      }
      return parseFloat(tok);
    }

    const result = parseExpression();
    if (pos < tokens.length) throw new Error('Expression invalide');
    return result;
  }

  // Génère les points (x, y) sur un intervalle donné
  function generatePoints(expr, xMin, xMax, steps = 200) {
    const points = [];
    const step = (xMax - xMin) / steps;
    for (let i = 0; i <= steps; i++) {
      const x = xMin + i * step;
      try {
        const y = evaluateAt(expr, x);
        if (isFinite(y)) points.push({ x, y });
        else points.push({ x, y: null }); // trou dans la courbe (ex: division par 0)
      } catch (e) {
        points.push({ x, y: null });
      }
    }
    return points;
  }

  // Dérivée numérique (méthode des différences finies centrées)
  function derivativeAt(expr, x, h = 0.0001) {
    try {
      const yPlus = evaluateAt(expr, x + h);
      const yMinus = evaluateAt(expr, x - h);
      return (yPlus - yMinus) / (2 * h);
    } catch (e) {
      return null;
    }
  }

  // Recherche approximative des zéros (changement de signe) sur l'intervalle
  function findApproximateZeros(expr, xMin, xMax, steps = 400) {
    const zeros = [];
    const step = (xMax - xMin) / steps;
    let prevY = null, prevX = null;
    for (let i = 0; i <= steps; i++) {
      const x = xMin + i * step;
      let y;
      try { y = evaluateAt(expr, x); } catch (e) { y = null; }
      if (y !== null && prevY !== null && isFinite(y) && isFinite(prevY)) {
        if (prevY === 0) zeros.push(prevX);
        else if (prevY * y < 0) {
          // interpolation linéaire simple pour affiner
          const ratio = Math.abs(prevY) / (Math.abs(prevY) + Math.abs(y));
          zeros.push(prevX + ratio * (x - prevX));
        }
      }
      prevY = y; prevX = x;
    }
    return zeros.map(z => Math.round(z * 1000) / 1000);
  }

  return { evaluateAt, generatePoints, derivativeAt, findApproximateZeros };
})();

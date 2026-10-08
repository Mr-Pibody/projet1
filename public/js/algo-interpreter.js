// ============================================
// INTERPRÉTEUR DE PSEUDO-CODE FRANÇAIS (façon AlgoBox)
// S'exécute entièrement dans le navigateur — zéro charge serveur.
// Syntaxe supportée :
//   VARIABLES x EN NOMBRE
//   DEBUT
//     x PREND_LA_VALEUR 5
//     AFFICHER x
//     POUR i ALLANT_DE 1 A 10
//       ...
//     FIN_POUR
//     TANT_QUE condition FAIRE
//       ...
//     FIN_TANT_QUE
//     SI condition ALORS
//       ...
//     SINON
//       ...
//     FIN_SI
//   FIN
// ============================================

const AlgoInterpreter = (function () {

  class AlgoError extends Error {
    constructor(message, line) {
      super(message);
      this.line = line;
    }
  }

  function tokenizeLines(code) {
    return code.split('\n')
      .map((raw, idx) => ({ raw: raw.trim(), lineNum: idx + 1 }))
      .filter(l => l.raw.length > 0 && !l.raw.startsWith('//'));
  }

  // Évalue une expression arithmétique/booléenne en remplaçant les variables par leurs valeurs
  function evalExpr(expr, variables) {
    let safe = expr;
    // Remplace les opérateurs façon pseudo-code par du JS
    safe = safe.replace(/\bET\b/gi, '&&').replace(/\bOU\b/gi, '||').replace(/\bNON\b/gi, '!');
    safe = safe.replace(/<>/g, '!=').replace(/=/g, '==').replace(/!=/g, '!==').replace(/==/g, '===');
    // restaure les opérateurs <= >= qui auraient été cassés par le remplacement de '='
    safe = safe.replace(/<\s*===/g, '<=').replace(/>\s*===/g, '>=');

    // Remplace chaque variable connue par sa valeur (entre parenthèses pour la sécurité de priorité)
    Object.keys(variables).sort((a, b) => b.length - a.length).forEach(name => {
      const re = new RegExp(`\\b${name}\\b`, 'g');
      const val = variables[name];
      safe = safe.replace(re, typeof val === 'string' ? JSON.stringify(val) : `(${val})`);
    });

    // Sécurité : on n'autorise que les caractères mathématiques/logiques attendus
    if (!/^[\d\s+\-*/%()&|!<>=.,"a-zA-ZÀ-ÿ_]*$/.test(safe)) {
      throw new AlgoError(`Expression non autorisée : ${expr}`);
    }

    try {
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${safe});`)();
    } catch (e) {
      throw new AlgoError(`Impossible d'évaluer l'expression : ${expr}`);
    }
  }

  function run(code, onOutput) {
    const lines = tokenizeLines(code);
    const variables = {};
    const output = [];
    let stepsExecuted = 0;
    const MAX_STEPS = 100000; // garde-fou anti-boucle infinie

    function emit(text) {
      output.push(text);
      if (onOutput) onOutput(text);
    }

    // Trouve l'index de la ligne correspondant au mot-clé de fermeture, en gérant l'imbrication
    // Vérifie qu'une ligne commence EXACTEMENT par le mot-clé (mot entier, pas juste un préfixe textuel)
    function lineStartsWithKeyword(line, keyword) {
      const re = new RegExp(`^${keyword}\\b`, 'i');
      return re.test(line);
    }

    function findMatchingEnd(startIdx, openKeyword, closeKeyword) {
      let depth = 1;
      for (let i = startIdx + 1; i < lines.length; i++) {
        const l = lines[i].raw;
        if (lineStartsWithKeyword(l, openKeyword)) depth++;
        if (lineStartsWithKeyword(l, closeKeyword)) { depth--; if (depth === 0) return i; }
      }
      throw new AlgoError(`${closeKeyword} manquant pour ${openKeyword}`, lines[startIdx].lineNum);
    }

    function execBlock(startIdx, endIdx) {
      let i = startIdx;
      while (i < endIdx) {
        stepsExecuted++;
        if (stepsExecuted > MAX_STEPS) throw new AlgoError('Trop d\'étapes exécutées (boucle infinie probable).');

        const line = lines[i];
        const text = line.raw;
        const upper = text.toUpperCase();

        // ---- VARIABLES (déclaration, ignorée à l'exécution mais validée syntaxiquement) ----
        if (upper.startsWith('VARIABLES') || upper === 'DEBUT' || upper === 'FIN') { i++; continue; }

        // ---- AFFECTATION : x PREND_LA_VALEUR expr ----
        let m = text.match(/^(\w+)\s+PREND_LA_VALEUR\s+(.+)$/i);
        if (m) {
          const [, varName, expr] = m;
          variables[varName] = evalExpr(expr, variables);
          i++; continue;
        }

        // ---- AFFICHER expr ----
        m = text.match(/^AFFICHER\s+(.+)$/i);
        if (m) {
          const expr = m[1].trim();
          // Si c'est une chaîne littérale entre guillemets, on l'affiche telle quelle (sans les guillemets)
          const strMatch = expr.match(/^['"](.*)['"]$/);
          if (strMatch) {
            emit(strMatch[1]);
          } else {
            let val;
            try { val = evalExpr(expr, variables); } catch (e) { val = expr; }
            emit(String(val));
          }
          i++; continue;
        }

        // ---- POUR i ALLANT_DE a A b ----
        m = text.match(/^POUR\s+(\w+)\s+ALLANT_DE\s+(.+?)\s+A\s+(.+)$/i);
        if (m) {
          const [, varName, fromExpr, toExpr] = m;
          const endFor = findMatchingEnd(i, 'POUR', 'FIN_POUR');
          const from = evalExpr(fromExpr, variables);
          const to = evalExpr(toExpr, variables);
          for (let v = from; v <= to; v++) {
            variables[varName] = v;
            execBlock(i + 1, endFor);
          }
          i = endFor + 1; continue;
        }

        // ---- TANT_QUE condition FAIRE ----
        m = text.match(/^TANT_QUE\s+(.+?)\s+FAIRE$/i);
        if (m) {
          const condExpr = m[1];
          const endWhile = findMatchingEnd(i, 'TANT_QUE', 'FIN_TANT_QUE');
          let guard = 0;
          while (evalExpr(condExpr, variables)) {
            execBlock(i + 1, endWhile);
            guard++;
            if (guard > MAX_STEPS) throw new AlgoError('Boucle TANT_QUE infinie détectée.');
          }
          i = endWhile + 1; continue;
        }

        // ---- SI condition ALORS ... SINON ... FIN_SI ----
        m = text.match(/^SI\s+(.+?)\s+ALORS$/i);
        if (m) {
          const condExpr = m[1];
          const endIf = findMatchingEnd(i, 'SI', 'FIN_SI');
          // cherche un SINON au même niveau entre i et endIf
          let sinonIdx = -1, depth = 0;
          for (let k = i + 1; k < endIf; k++) {
            const l = lines[k].raw;
            if (lineStartsWithKeyword(l, 'SI')) depth++;
            if (lineStartsWithKeyword(l, 'FIN_SI')) depth--;
            if (lineStartsWithKeyword(l, 'SINON') && depth === 0) { sinonIdx = k; break; }
          }
          const condResult = evalExpr(condExpr, variables);
          if (condResult) {
            execBlock(i + 1, sinonIdx === -1 ? endIf : sinonIdx);
          } else if (sinonIdx !== -1) {
            execBlock(sinonIdx + 1, endIf);
          }
          i = endIf + 1; continue;
        }

        if (upper === 'SINON' || upper.startsWith('FIN_')) { i++; continue; }

        throw new AlgoError(`Instruction non reconnue : "${text}"`, line.lineNum);
      }
    }

    try {
      execBlock(0, lines.length);
      return { success: true, output };
    } catch (e) {
      return { success: false, output, error: e.message, line: e.line };
    }
  }

  return { run };
})();

'use strict';

/**
 * PortfolioOS custom ESLint rules. Enforces §3.10 (no silent catch) and
 * §3.2 (money is Decimal, never Number).
 *
 * Two rules:
 *   - no-silent-catch  — catches must handle the error meaningfully
 *   - no-money-coercion — ban Number()/parseFloat on values that may be money
 *
 * Registered as `portfolioos/<rule-name>` once the root `.eslintrc.cjs` lists
 * this package under `plugins`.
 */

/**
 * §3.10 targets two failure modes:
 *   1. `catch (e) { }` — empty swallow.
 *   2. `catch (e) { console.log(e) }` — "logged" to stdout in a way that
 *      gets nowhere near our pino pipeline or DLQ.
 *
 * Anything else the codebase does in a catch (rethrow, return a typed
 * failure like `{ ok: false, error }`, forward to `next(err)`, mutate a DB
 * row) counts as deliberate handling. We treat a catch as silent iff the
 * body contains no effectful statements beyond `console.*` calls.
 */

/** Walk the subtree under `node` calling `visit` on every node. */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, visit);
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      walk(child, visit);
    }
  }
}

function isConsoleCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'console'
  );
}

/** A statement is "only-console" if it's an ExpressionStatement wrapping a console.* call. */
function isConsoleOnlyStatement(stmt) {
  return (
    stmt.type === 'ExpressionStatement' &&
    isConsoleCall(stmt.expression)
  );
}

/**
 * Look for any statement or nested expression that isn't a no-op or
 * console.*. If we find one, the catch is doing something — not silent.
 */
function catchBodyHasNonConsoleEffect(block) {
  for (const stmt of block.body) {
    if (isConsoleOnlyStatement(stmt)) continue;
    // Anything else at the top level counts (throw, return, await-expr,
    // assignment, if-block, try-finally, etc.). Even a bare comment-free
    // empty expression statement is unusual enough to treat as intent.
    let hasEffect = false;
    walk(stmt, (n) => {
      if (hasEffect) return;
      if (n === stmt) return;
      if (
        n.type === 'ThrowStatement' ||
        n.type === 'ReturnStatement' ||
        n.type === 'AwaitExpression' ||
        n.type === 'AssignmentExpression' ||
        n.type === 'NewExpression' ||
        (n.type === 'CallExpression' && !isConsoleCall(n))
      ) {
        hasEffect = true;
      }
    });
    // Top-level non-console statement (e.g. if/for/try) without any
    // effectful descendant still counts as "author wrote code on purpose".
    if (hasEffect) return true;
    if (
      stmt.type !== 'EmptyStatement' &&
      stmt.type !== 'BlockStatement'
    ) {
      return true;
    }
  }
  return false;
}

const noSilentCatch = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban `catch (e) {}` and `catch (e) { console.log(e) }` — every catch must do something meaningful: rethrow, return a typed failure, call logger.*, write to the DLQ, or forward to next(err) (§3.10).',
    },
    schema: [],
    messages: {
      empty:
        'Silent catch — empty body swallows the error. Rethrow, log via logger.*, write to DLQ, or return a typed failure (§3.10).',
      consoleOnly:
        'Silent catch — `console.*` alone is not real handling. Use logger.* (pino), rethrow, write to the ingestion DLQ, or return a typed failure (§3.10).',
    },
  },
  create(context) {
    return {
      CatchClause(node) {
        if (!node.body || node.body.type !== 'BlockStatement') return;
        if (node.body.body.length === 0) {
          context.report({ node, messageId: 'empty' });
          return;
        }
        // Every statement is a console.* call → silent by §3.10's second
        // failure mode. Any other statement/effect → assume intentional
        // handling. Escape-hatch via `// eslint-disable-next-line` on the
        // `} catch` line for tiny best-effort cleanups.
        const allConsole = node.body.body.every(isConsoleOnlyStatement);
        if (allConsole) {
          context.report({ node, messageId: 'consoleOnly' });
          return;
        }
        if (!catchBodyHasNonConsoleEffect(node.body)) {
          // Body isn't all-console but also has no observable effect — rare
          // (e.g. a lone `"string"` directive). Treat as silent.
          context.report({ node, messageId: 'empty' });
        }
      },
    };
  },
};

const noMoneyCoercion = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban JS-number coercion patterns that silently corrupt money (§3.2). `parseFloat` is always wrong for money; `Number(x)` is usually wrong. Use `toDecimal()` from @portfolioos/shared.',
    },
    schema: [],
    messages: {
      parseFloat:
        '`parseFloat` silently loses decimal precision — use `toDecimal()` from @portfolioos/shared for money, `Number.parseFloat` (explicit) for genuinely non-monetary floats.',
      numberCall:
        '`Number(x)` can silently lose precision on money strings — use `toDecimal()` for money, `Number.parseInt` / `Number.parseFloat` (explicit) for non-monetary values. Add `// eslint-disable-next-line portfolioos/no-money-coercion -- <reason>` if intentional.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier') return;
        if (callee.name === 'parseFloat') {
          context.report({ node, messageId: 'parseFloat' });
        } else if (callee.name === 'Number') {
          context.report({ node, messageId: 'numberCall' });
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'no-silent-catch': noSilentCatch,
    'no-money-coercion': noMoneyCoercion,
  },
};

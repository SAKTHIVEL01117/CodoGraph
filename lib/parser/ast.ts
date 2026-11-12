/**
 * CodoGraph — Phase 3 & Phase 9: TypeScript / JavaScript AST Import & Export Extractor.
 *
 * Uses ts-morph to extract module dependency specifiers and CommonJS exports:
 * 1. Plain import declarations
 * 2. Re-export declarations with module specifiers
 * 3. Dynamic import() calls with string literal arguments
 * 4. CommonJS require() calls (and TypeScript `import x = require(...)`)
 * 5. CommonJS exported symbol names (`exports.*`, `module.exports`, `Object.assign`, `Object.defineProperty`)
 *
 * Invariant: Syntax extraction is purely structural and reads real AST tokens.
 */
import { Project, SyntaxKind, Node, type ObjectLiteralExpression } from 'ts-morph';
import type { EdgeKind } from './types.ts';

export interface ExtractedSpecifier {
  specifier: string;
  kind: EdgeKind;
  isLiteral: boolean;
  rawExpression?: string;
}

export interface ExtractedModuleSyntax {
  specifiers: ExtractedSpecifier[];
  exports: string[];
}

function createFallbackProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      jsx: 1,
    },
  });
}

function unwrapParens(node: Node): Node {
  let curr = node;
  while (Node.isParenthesizedExpression(curr)) {
    curr = curr.getExpression();
  }
  return curr;
}

function getStaticPropertyKey(node: Node): string | null {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  if (Node.isNumericLiteral(node)) {
    return String(node.getLiteralValue());
  }
  if (Node.isComputedPropertyName(node)) {
    const inner = unwrapParens(node.getExpression());
    if (Node.isStringLiteral(inner) || Node.isNoSubstitutionTemplateLiteral(inner)) {
      return inner.getLiteralValue();
    }
  }
  return null;
}

function isModuleExportsExpr(node: Node): boolean {
  const n = unwrapParens(node);
  if (Node.isPropertyAccessExpression(n)) {
    const obj = unwrapParens(n.getExpression());
    return Node.isIdentifier(obj) && obj.getText() === 'module' && n.getName() === 'exports';
  }
  if (Node.isElementAccessExpression(n)) {
    const obj = unwrapParens(n.getExpression());
    const arg = n.getArgumentExpression();
    return (
      Node.isIdentifier(obj) &&
      obj.getText() === 'module' &&
      arg !== undefined &&
      (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) &&
      arg.getLiteralValue() === 'exports'
    );
  }
  return false;
}

function isExportsRootExpr(node: Node): boolean {
  const n = unwrapParens(node);
  if (Node.isIdentifier(n) && n.getText() === 'exports') {
    return true;
  }
  return isModuleExportsExpr(n);
}

function getObjectMethodName(callee: Node): string | null {
  const c = unwrapParens(callee);
  if (Node.isPropertyAccessExpression(c)) {
    const base = unwrapParens(c.getExpression());
    if (Node.isIdentifier(base) && base.getText() === 'Object') {
      return c.getName();
    }
  }
  return null;
}

function extractObjectLiteralKeys(
  obj: ObjectLiteralExpression,
  addName: (name: string) => void
): void {
  for (const prop of obj.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const key = getStaticPropertyKey(prop.getNameNode());
      if (key) addName(key);
    } else if (Node.isShorthandPropertyAssignment(prop)) {
      addName(prop.getName());
    } else if (
      Node.isMethodDeclaration(prop) ||
      Node.isGetAccessorDeclaration(prop) ||
      Node.isSetAccessorDeclaration(prop)
    ) {
      const key = getStaticPropertyKey(prop.getNameNode());
      if (key) addName(key);
    }
  }
}

function extractNamesFromRhs(
  rhs: Node,
  localObjectBindings: Map<string, ObjectLiteralExpression>,
  addName: (name: string) => void
): void {
  let curr = unwrapParens(rhs);
  while (
    Node.isBinaryExpression(curr) &&
    curr.getOperatorToken().getKind() === SyntaxKind.EqualsToken
  ) {
    curr = unwrapParens(curr.getRight());
  }

  if (Node.isObjectLiteralExpression(curr)) {
    extractObjectLiteralKeys(curr, addName);
    return;
  }

  if (Node.isFunctionExpression(curr) || Node.isClassExpression(curr)) {
    const symName = curr.getName();
    if (symName) addName(symName);
    return;
  }

  if (Node.isIdentifier(curr)) {
    const ident = curr.getText();
    if (ident === 'exports' || ident === 'undefined' || ident === 'null') {
      return;
    }
    const boundObj = localObjectBindings.get(ident);
    if (boundObj) {
      extractObjectLiteralKeys(boundObj, addName);
    } else {
      addName(ident);
    }
    return;
  }

  if (Node.isCallExpression(curr) && getObjectMethodName(curr.getExpression()) === 'assign') {
    const args = curr.getArguments();
    for (let i = 0; i < args.length; i++) {
      const arg = unwrapParens(args[i]);
      if (Node.isObjectLiteralExpression(arg)) {
        extractObjectLiteralKeys(arg, addName);
      } else if (Node.isIdentifier(arg)) {
        const ident = arg.getText();
        const boundObj = localObjectBindings.get(ident);
        if (boundObj) {
          extractObjectLiteralKeys(boundObj, addName);
        } else if (i === 0 && ident !== 'exports' && ident !== 'undefined' && ident !== 'null') {
          addName(ident);
        }
      } else if (i === 0 && (Node.isFunctionExpression(arg) || Node.isClassExpression(arg))) {
        const symName = arg.getName();
        if (symName) addName(symName);
      }
    }
  }
}

/**
 * Extracts all imports, re-exports, dynamic imports, CommonJS require() calls,
 * and CommonJS exported symbol names from a source file in a single AST pass.
 */
export function extractModuleSyntaxFromSource(
  filePath: string,
  content: string,
  project?: Project
): ExtractedModuleSyntax {
  const p = project ?? createFallbackProject();
  const sourceFile = p.createSourceFile(filePath, content, { overwrite: true });
  const extracted: ExtractedSpecifier[] = [];
  const exportNamesSet = new Set<string>();

  const addExportName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === '__esModule') return;
    exportNamesSet.add(trimmed);
  };

  // Pre-collect local function `require` declarations and local object bindings
  const hasLocalRequireFunctionDecl = sourceFile
    .getFunctions()
    .some((fn) => fn.getName() === 'require');

  const localObjectBindings = new Map<string, ObjectLiteralExpression>();
  for (const decl of sourceFile.getVariableDeclarations()) {
    const nameNode = decl.getNameNode();
    const init = decl.getInitializer();
    if (Node.isIdentifier(nameNode) && init) {
      const unwrapped = unwrapParens(init);
      if (Node.isObjectLiteralExpression(unwrapped)) {
        localObjectBindings.set(nameNode.getText(), unwrapped);
      }
    }
  }

  // 1. Plain Import Declarations: import { ... } from "..."
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue();
    if (specifier) {
      extracted.push({
        specifier,
        kind: 'import',
        isLiteral: true,
      });
    }
  }

  // 1b. TypeScript CommonJS import equals: import foo = require("./foo")
  for (const importEquals of sourceFile.getDescendantsOfKind(
    SyntaxKind.ImportEqualsDeclaration
  )) {
    const ref = importEquals.getModuleReference();
    if (Node.isExternalModuleReference(ref)) {
      const expr = ref.getExpression();
      if (
        expr &&
        (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))
      ) {
        const specifier = expr.getLiteralValue();
        if (specifier) {
          extracted.push({
            specifier,
            kind: 'require',
            isLiteral: true,
          });
        }
      }
    }
  }

  // 2. Re-Export Declarations: export { ... } from "..." or export * from "..."
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    if (exportDecl.hasModuleSpecifier()) {
      const specifier = exportDecl.getModuleSpecifierValue();
      if (specifier) {
        extracted.push({
          specifier,
          kind: 're-export',
          isLiteral: true,
        });
      }
    }
  }

  // 2b. TypeScript export = ... CommonJS assignment
  for (const exportAssign of sourceFile.getExportAssignments()) {
    if (exportAssign.isExportEquals()) {
      extractNamesFromRhs(
        exportAssign.getExpression(),
        localObjectBindings,
        addExportName
      );
    }
  }

  // 3. Call Expressions: dynamic import(), require(), and Object.* CommonJS export helpers
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.ImportKeyword) {
      const args = call.getArguments();
      if (args.length > 0) {
        const firstArg = args[0];
        if (Node.isStringLiteral(firstArg)) {
          extracted.push({
            specifier: firstArg.getLiteralValue(),
            kind: 'dynamic_import',
            isLiteral: true,
          });
        } else {
          // Dynamic import with non-literal argument (e.g. import(variable))
          extracted.push({
            specifier: firstArg.getText(),
            kind: 'dynamic_import',
            isLiteral: false,
            rawExpression: firstArg.getText(),
          });
        }
      }
      continue;
    }

    if (Node.isIdentifier(expr) && expr.getText() === 'require') {
      const args = call.getArguments();
      if (args.length === 1) {
        const firstArg = args[0];
        if (
          Node.isStringLiteral(firstArg) ||
          Node.isNoSubstitutionTemplateLiteral(firstArg)
        ) {
          const specifier = firstArg.getLiteralValue();
          if (specifier) {
            extracted.push({
              specifier,
              kind: 'require',
              isLiteral: true,
            });
          }
        } else if (!hasLocalRequireFunctionDecl) {
          extracted.push({
            specifier: firstArg.getText(),
            kind: 'require',
            isLiteral: false,
            rawExpression: firstArg.getText(),
          });
        }
      }
      continue;
    }

    const objMethod = getObjectMethodName(expr);
    if (objMethod === 'assign') {
      const args = call.getArguments();
      if (args.length >= 2 && isExportsRootExpr(args[0])) {
        for (const srcArg of args.slice(1)) {
          const src = unwrapParens(srcArg);
          if (Node.isObjectLiteralExpression(src)) {
            extractObjectLiteralKeys(src, addExportName);
          } else if (Node.isIdentifier(src)) {
            const boundObj = localObjectBindings.get(src.getText());
            if (boundObj) extractObjectLiteralKeys(boundObj, addExportName);
          }
        }
      }
    } else if (objMethod === 'defineProperty') {
      const args = call.getArguments();
      if (args.length >= 2 && isExportsRootExpr(args[0])) {
        const keyNode = unwrapParens(args[1]);
        if (
          Node.isStringLiteral(keyNode) ||
          Node.isNoSubstitutionTemplateLiteral(keyNode)
        ) {
          addExportName(keyNode.getLiteralValue());
        }
      }
    } else if (objMethod === 'defineProperties') {
      const args = call.getArguments();
      if (args.length >= 2 && isExportsRootExpr(args[0])) {
        const desc = unwrapParens(args[1]);
        if (Node.isObjectLiteralExpression(desc)) {
          extractObjectLiteralKeys(desc, addExportName);
        } else if (Node.isIdentifier(desc)) {
          const boundObj = localObjectBindings.get(desc.getText());
          if (boundObj) extractObjectLiteralKeys(boundObj, addExportName);
        }
      }
    }
  }

  // 4. CommonJS export assignments: exports.foo = ..., module.exports.foo = ..., module.exports = ...
  for (const binExpr of sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (binExpr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }

    const lhs = unwrapParens(binExpr.getLeft());

    // 4a. module.exports = ... (must run before property/element checks because module.exports is itself property/element access)
    if (isModuleExportsExpr(lhs)) {
      extractNamesFromRhs(binExpr.getRight(), localObjectBindings, addExportName);
      continue;
    }

    // 4b. exports.foo = ... or module.exports.foo = ...
    if (Node.isPropertyAccessExpression(lhs)) {
      if (isExportsRootExpr(lhs.getExpression())) {
        addExportName(lhs.getName());
      }
      continue;
    }

    // 4c. exports['foo'] = ... or module.exports['foo'] = ...
    if (Node.isElementAccessExpression(lhs)) {
      if (isExportsRootExpr(lhs.getExpression())) {
        const arg = lhs.getArgumentExpression();
        if (arg) {
          const unpackedArg = unwrapParens(arg);
          if (
            Node.isStringLiteral(unpackedArg) ||
            Node.isNoSubstitutionTemplateLiteral(unpackedArg)
          ) {
            addExportName(unpackedArg.getLiteralValue());
          }
        }
      }
      continue;
    }
  }

  return {
    specifiers: extracted,
    exports: Array.from(exportNamesSet),
  };
}

/**
 * Extracts all imports, re-exports, dynamic imports, and require() calls from a source file.
 */
export function extractSpecifiersFromSource(
  filePath: string,
  content: string,
  project?: Project
): ExtractedSpecifier[] {
  return extractModuleSyntaxFromSource(filePath, content, project).specifiers;
}

/**
 * Extracts all CommonJS exported symbol names from a source file.
 */
export function extractCommonJsExportsFromSource(
  filePath: string,
  content: string,
  project?: Project
): string[] {
  return extractModuleSyntaxFromSource(filePath, content, project).exports;
}

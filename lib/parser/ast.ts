/**
 * CodoGraph — Phase 3: TypeScript AST Import & Export Extractor.
 *
 * Uses ts-morph to extract the three required syntax constructs:
 * 1. Plain import declarations
 * 2. Re-export declarations with module specifiers
 * 3. Dynamic import() calls with string literal arguments
 *
 * Invariant: Syntax extraction is purely structural and reads real AST tokens.
 */
import { Project, SyntaxKind, Node } from 'ts-morph';
import type { EdgeKind } from './types.ts';

export interface ExtractedSpecifier {
  specifier: string;
  kind: EdgeKind;
  isLiteral: boolean;
  rawExpression?: string;
}

/**
 * Extracts all imports, re-exports, and dynamic imports from a source file.
 */
export function extractSpecifiersFromSource(
  filePath: string,
  content: string,
  project?: Project
): ExtractedSpecifier[] {
  const p = project ?? new Project({ useInMemoryFileSystem: true });
  const sourceFile = p.createSourceFile(filePath, content, { overwrite: true });
  const extracted: ExtractedSpecifier[] = [];

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

  // 3. Dynamic import() Calls: import("./foo")
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
    }
  }

  return extracted;
}

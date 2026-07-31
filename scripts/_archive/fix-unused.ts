/**
 * 批量修复 TS6133 未使用变量/导入。
 *
 * 策略：
 * - 未使用的 import specifier/declaration 直接移除。
 * - 未使用的 catch 变量重命名为 _e/_error。
 * - 未使用的函数参数重命名为 _xxx。
 * - 其他未使用的局部变量重命名为 _xxx（保留代码，避免误删有副作用的调用）。
 */
import { Project, Node, ImportDeclaration, ImportSpecifier, SourceFile, ts, Identifier } from 'ts-morph';

const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
});

function removeImportSpecifier(specifier: ImportSpecifier) {
    const decl = specifier.getImportDeclaration();
    if (!decl) return;
    const allNamed = decl.getNamedImports();
    if (allNamed.length <= 1) {
        decl.remove();
    } else {
        specifier.remove();
    }
}

function removeDefaultImport(decl: ImportDeclaration) {
    if (decl.getNamedImports().length === 0 && !decl.getNamespaceImport()) {
        decl.remove();
    } else {
        decl.removeDefaultImport();
    }
}

function renameIdentifier(id: Identifier) {
    const text = id.getText();
    if (!text.startsWith('_')) {
        id.rename('_' + text);
        return true;
    }
    return false;
}

function fixIdentifier(id: Identifier, name: string): boolean {
    if (id.getText() !== name) return false;
    const ancestors = id.getAncestors();

    // Import specifier
    const importSpecifier = ancestors.find(a => a.getKind() === ts.SyntaxKind.ImportSpecifier) as ImportSpecifier | undefined;
    if (importSpecifier) {
        removeImportSpecifier(importSpecifier);
        return true;
    }

    // Default import
    const importDecl = ancestors.find(a => a.getKind() === ts.SyntaxKind.ImportDeclaration) as ImportDeclaration | undefined;
    if (importDecl && importDecl.getDefaultImport() === id) {
        removeDefaultImport(importDecl);
        return true;
    }

    // Catch / parameter / variable
    for (const ancestor of ancestors) {
        const kind = ancestor.getKind();
        if (kind === ts.SyntaxKind.CatchClause) {
            return renameIdentifier(id);
        }
        if (kind === ts.SyntaxKind.Parameter) {
            return renameIdentifier(id);
        }
        if (kind === ts.SyntaxKind.VariableDeclaration) {
            return renameIdentifier(id);
        }
    }
    return false;
}

function fixDiagnostic(sourceFile: SourceFile, start: number, name: string) {
    // 获取最内层节点
    const node = sourceFile.getDescendantAtPos(start);
    if (!node) return false;

    // 如果诊断指向 Identifier，优先用专用逻辑
    if (Node.isIdentifier(node)) {
        if (fixIdentifier(node, name)) return true;
    }

    // 向上遍历祖先
    const ancestors = node.getAncestors();
    ancestors.unshift(node);

    for (const ancestor of ancestors) {
        const kind = ancestor.getKind();

        if (kind === ts.SyntaxKind.ImportSpecifier) {
            const specifier = ancestor as ImportSpecifier;
            if (specifier.getName() === name) {
                removeImportSpecifier(specifier);
                return true;
            }
        }

        if (kind === ts.SyntaxKind.ImportClause) {
            const decl = ancestor.getFirstAncestorByKind(ts.SyntaxKind.ImportDeclaration);
            if (!decl) continue;
            const defaultImport = decl.getDefaultImport();
            if (defaultImport && defaultImport.getText() === name) {
                removeDefaultImport(decl);
                return true;
            }
            const namespaceImport = decl.getNamespaceImport();
            if (namespaceImport && namespaceImport.getText() === name) {
                decl.removeNamespaceImport();
                // 如果只剩空clause，移除整个声明
                if (decl.getDefaultImport() === undefined && decl.getNamedImports().length === 0) {
                    decl.remove();
                }
                return true;
            }
        }

        if (kind === ts.SyntaxKind.CatchClause) {
            const varDecl = (ancestor as import('ts-morph').CatchClause).getVariableDeclaration();
            if (!varDecl) continue;
            const id = varDecl.getNameNode();
            if (Node.isIdentifier(id) && id.getText() === name) {
                return renameIdentifier(id);
            }
        }

        if (kind === ts.SyntaxKind.Parameter) {
            const param = ancestor as import('ts-morph').ParameterDeclaration;
            const nameNode = param.getNameNode();
            if (Node.isIdentifier(nameNode) && nameNode.getText() === name) {
                return renameIdentifier(nameNode);
            }
        }

        if (kind === ts.SyntaxKind.VariableDeclaration) {
            const varDecl = ancestor as import('ts-morph').VariableDeclaration;
            const nameNode = varDecl.getNameNode();
            if (Node.isIdentifier(nameNode) && nameNode.getText() === name) {
                return renameIdentifier(nameNode);
            }
        }
    }

    // Fallback: 如果诊断位置不在预期节点上，搜索最近的同名 Identifier
    const nearestId = findNearestIdentifier(sourceFile, start, name);
    if (nearestId && fixIdentifier(nearestId, name)) {
        return true;
    }

    return false;
}

function findNearestIdentifier(sourceFile: SourceFile, start: number, name: string): Identifier | undefined {
    const ids = sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier).filter(id => id.getText() === name);
    if (ids.length === 0) return undefined;
    if (ids.length === 1) return ids[0];
    // 找位置最近的
    return ids.reduce((nearest, id) => {
        const dist = Math.abs(id.getStart() - start);
        const nearestDist = Math.abs(nearest.getStart() - start);
        return dist < nearestDist ? id : nearest;
    });
}

const diagnostics = project.getPreEmitDiagnostics().filter(d => d.getCode() === 6133);
console.log(`Found ${diagnostics.length} TS6133 diagnostics.`);

let fixed = 0;
let skipped = 0;
for (const d of diagnostics) {
    const sourceFile = d.getSourceFile();
    const start = d.getStart();
    const message = d.getMessageText();
    if (!sourceFile || !start) {
        skipped++;
        continue;
    }
    const nameMatch = typeof message === 'string' ? message.match(/^'([^']+)'/) : null;
    const name = nameMatch ? nameMatch[1] : '';
    if (!name) {
        skipped++;
        continue;
    }
    try {
        if (fixDiagnostic(sourceFile, start, name)) {
            fixed++;
        } else {
            console.warn(`SKIP ${sourceFile.getFilePath()}:${start} '${name}' (node=${sourceFile.getDescendantAtPos(start)?.getKindName()})`);
            skipped++;
        }
    } catch (e) {
        console.warn(`ERR ${sourceFile.getFilePath()} '${name}': ${e}`);
        skipped++;
    }
}

project.saveSync();
console.log(`Fixed ${fixed}, skipped ${skipped}.`);

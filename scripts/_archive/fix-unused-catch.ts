/**
 * 批量重命名未使用的 catch 变量为 _e / _error，以通过 ESLint no-unused-vars。
 *
 * 策略：
 * - 遍历 src 下所有 .ts/.tsx 文件。
 * - 用 ts-morph 找到所有 CatchClause。
 * - 如果 catch 变量在 catch 块内未被引用，则重命名为 _xxx。
 */
import { Project, ts, Node } from 'ts-morph';

const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
});

const sourceFiles = project.getSourceFiles();
let fixed = 0;
let skipped = 0;

for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes('node_modules')) continue;

    const catchClauses = sourceFile.getDescendantsOfKind(ts.SyntaxKind.CatchClause);
    for (const catchClause of catchClauses) {
        const varDecl = catchClause.getVariableDeclaration();
        if (!varDecl) continue;

        const nameNode = varDecl.getNameNode();
        if (!Node.isIdentifier(nameNode)) continue;

        const varName = nameNode.getText();
        if (varName.startsWith('_')) continue;

        // 检查 catch 块内是否有对该变量的引用
        const block = catchClause.getBlock();
        if (!block) continue;

        const references = nameNode.findReferencesAsNodes();
        const usedInBlock = references.some(ref => {
            if (ref === nameNode) return false;
            return ref.getAncestors().some(a => a === block);
        });

        if (!usedInBlock) {
            nameNode.rename('_' + varName);
            fixed++;
        } else {
            skipped++;
        }
    }
}

project.saveSync();
console.log(`Fixed ${fixed} unused catch variables, skipped ${skipped} used ones.`);

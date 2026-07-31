/**
 * 恢复被误删的 React named imports。
 *
 * 扫描每个 ts/tsx 文件，若文件中使用了 React API 但未导入，
 * 则自动补充 import { ... } from 'react'。
 */
import { Project, SourceFile } from 'ts-morph';

const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
});

const HOOKS_AND_TYPES = [
    'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext',
    'forwardRef', 'useImperativeHandle', 'createContext', 'Component', 'ReactNode',
    'ErrorInfo', 'MouseEvent', 'ChangeEvent', 'FormEvent', 'KeyboardEvent',
    'SetStateAction', 'Dispatch'
];

function isUsed(sourceFile: SourceFile, name: string): boolean {
    const text = sourceFile.getFullText();
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    return regex.test(text);
}

function isImported(sourceFile: SourceFile, name: string): boolean {
    for (const decl of sourceFile.getImportDeclarations()) {
        if (decl.getModuleSpecifierValue() !== 'react') continue;
        for (const named of decl.getNamedImports()) {
            if (named.getName() === name) return true;
        }
        const defaultImport = decl.getDefaultImport();
        if (defaultImport && defaultImport.getText() === name) return true;
    }
    return false;
}

let fixed = 0;
for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes('node_modules')) continue;
    if (!/\.(ts|tsx)$/.test(filePath)) continue;

    const missing = HOOKS_AND_TYPES.filter(name => isUsed(sourceFile, name) && !isImported(sourceFile, name));
    if (missing.length === 0) continue;

    const reactDecl = sourceFile.getImportDeclarations().find(d => d.getModuleSpecifierValue() === 'react');
    if (reactDecl) {
        for (const name of missing) {
            reactDecl.addNamedImport(name);
        }
    } else {
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'react',
            namedImports: missing,
        });
    }
    console.log(`${filePath}: restored ${missing.join(', ')}`);
    fixed++;
}

project.saveSync();
console.log(`Restored React imports in ${fixed} files.`);

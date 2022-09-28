namespace ts {
    const Pirates = require("pirates") as typeof import("pirates");

    (function installRequireHook() {
        (globalThis as any).compiler_1 = ts;
        (globalThis as any).compiler_1.default = ts;

        Pirates.addHook((code, filename) => {
            return compileModule(code, filename);
        }, {
            extensions: [".ts"],
            ignoreNodeModules: true,
        });
    })();

    let metaProgram: Program | undefined;
    function getMetaProgram() {
        if(!!metaProgram) return metaProgram;

        console.time("create metaprogram");

        const declarations = getMacroDeclarations();
        const sourceFileNameSet = new Set<string>();
        for (const declaration of declarations) {
            const sourceFile = getSourceFileOfNode(declaration.node);
            sourceFileNameSet.add(sourceFile.fileName);
        }
        const sourceFileNames: string[] = [];
        sourceFileNameSet.forEach((fileName) => sourceFileNames.push(fileName));

        const compilerOptions: CompilerOptions = {
            metaprogram: true,
            target: ScriptTarget.ES5,
            module: ModuleKind.CommonJS,
            skipLibCheck: true,
            skipDefaultLibCheck: true,
            declaration: false,
            strict: true
        };

        metaProgram = createProgram({
            rootNames: sourceFileNames,
            options: compilerOptions
        });

        console.timeEnd("create metaprogram");

        return metaProgram;
    }

    function emitSourceFile(path: string) {
        const program = getMetaProgram();
        const source = program.getSourceFile(path);

        if(!source) {
            throw new Error(`Could not find source file for path ${path}`);
        }

        let emitText: string | undefined;
        const write: WriteFileCallback = (_fileName, text) => {
            emitText = text;
        };

        // eslint-disable-next-line local/boolean-trivia
        const metaEmit = program.emit(source, write, undefined, undefined, {
            before: [
                (context: TransformationContext) => (file: SourceFile) => {
                    return visitEachChild(file, (node) => {
                        if(isImportDeclaration(node)) {
                            if(isCompilerModuleSpecifier(node.moduleSpecifier)) {
                                return undefined;
                            }
                        }

                        return node;
                    }, context);
                }
            ]
        });

        if(metaEmit.diagnostics.length > 0) {
            console.error("Meta emit diagnostics:");
            console.error(formatDiagnostics(metaEmit.diagnostics, {
                getCurrentDirectory: () => sys.getCurrentDirectory(),
                getNewLine: () => sys.newLine,
                getCanonicalFileName: createGetCanonicalFileName(sys.useCaseSensitiveFileNames),
            }));
        }

        if(!emitText) {
            throw new Error(`Could not emit source file for path ${path}`);
        }

        return emitText;
    }

    const moduleCache = new Map<string, any>();
    const macroCache = new Map<MacroDeclarationNode, MacroExecutor>();

    function compileModule(_text: string, path: string) {
        const text = emitSourceFile(path);
        return text;
    }

    function loadModule(path: string) {
        if(moduleCache.has(path)) return moduleCache.get(path);

        const mod = require(path);
        moduleCache.set(path, mod);

        return mod;
    }

    export function loadMacro<T extends BaseMacro = BaseMacro>(declaration: MacroDeclarationNode): MacroExecutor<T> {
        if(macroCache.has(declaration)) return macroCache.get(declaration) as MacroExecutor<T>;

        const sourceFile = getSourceFileOfNode(declaration);
        const path = sourceFile.fileName;

        const mod = loadModule(path);

        if(isFunctionDeclaration(declaration)) {
            const name = hasSyntacticModifier(declaration, ModifierFlags.Default) ? "default" : declaration.name.escapedText.toString();
            const macro = mod[name];

            if(!macro) {
                throw new Error(`Function ${declaration.name.escapedText} not found in module ${path}`);
            }

            macroCache.set(declaration, macro);

            return macro;
        }
        else if(isFunctionExpression(declaration)) {
            const parent = declaration.parent;
            if(isVariableDeclaration(parent)) {
                if(isIdentifier(parent.name)) {
                    const name = parent.name.escapedText.toString();
                    const macro = mod[name];

                    if(!mod[name]) {
                        throw new Error(`Function ${name} not found in module ${path}`);
                    }

                    macroCache.set(declaration, macro);

                    return macro;
                }
            }
        }

        throw new Error(`Failed to load macro from ${path}`);
    }
}
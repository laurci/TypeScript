namespace ts {
    type TransformNode<T extends Node> = T & {
        replace(node: Node): void;
        remove(): void;
    };

    type StatementMatcher = (node: Statement) => boolean;

    type TransformSourceFile = SourceFile & {
        appendStatement(node: Statement): void;
        prependStatement(node: Statement): void;
        insertStatementBefore(node: Statement, match: StatementMatcher): void;
        insertStatementAfter(node: Statement, match: StatementMatcher): void;
    };
    interface TransformApi<T extends Node> {
        node: TransformNode<T>;
        factory: NodeFactory;
        context: TransformationContext;
        sourceFile: TransformSourceFile;
    }

    interface StatementPatch {
        condition?: StatementMatcher;
        node: Statement;
    }

    export class SourceFileStatementsPatcher {
        private before: StatementPatch[] = [];
        private after: StatementPatch[] = [];

        append(node: Statement) {
            this.after.push({
                node
            });
        }

        prepend(node: Statement) {  
            this.before.push({
                node
            });
        }

        insertBefore(node: Statement, match: StatementMatcher) {
            this.before.push({
                node,
                condition: match
            });
        }

        insertAfter(node: Statement, match: StatementMatcher) {
            this.after.push({
                node,
                condition: match
            });
        }

        patch(factory: NodeFactory, sourceFile: SourceFile) {
            const statements = sourceFile.statements.slice();

            for(let before of this.before) {
                if(!before.condition) {
                    statements.unshift(before.node);
                    continue;
                }

                for(let i = 0; i < statements.length; i++) {
                    if(before.condition(statements[i])) {
                        statements.splice(i, 0, before.node);
                        break;
                    }
                }
            }

            for(let after of this.after) {
                if(!after.condition) {
                    statements.push(after.node);
                    continue;
                }

                for(let i = 0; i < statements.length; i++) {
                    if(after.condition(statements[i])) {
                        statements.splice(i + 1, 0, after.node);
                        break;
                    }
                }
            }

            const newSourceFile = {
                ...sourceFile,
                statements: factory.createNodeArray(statements)
            } as SourceFile;

            return newSourceFile;
        }
    }

    export type TransformApiFunction<T extends Node> = (api: TransformApi<T>) => void;

    export interface MacroWithTransformApi<T extends Node> {
        transform(fn: TransformApiFunction<T>): void;
    }

    export function createTransformMacroApi<T extends Node>(hooks: MacroHooks<T>): MacroWithTransformApi<T> {
        return {
            transform(fn) {
                hooks.transform.push(fn);
            }
        };
    }

    export function executeTransformHook(hooks: MacroHooks<Node>, context: TransformationContext, node: Node, statementPatcher: SourceFileStatementsPatcher) {
        return hooks.transform.reduce((node, hook) => {
            let replacement: Node | undefined;
            let remove = false;

            const api: TransformApi<Node> = {
                node: {
                    ...node,
                    replace(newNode) {
                        (newNode.parent as any) = node.parent; // set parent
                        (newNode.pos as any) = node.pos; // set pos
                        replacement = newNode;
                    },
                    remove() {
                        remove = true;
                    }
                },
                factory,
                context,
                sourceFile: {
                    ...getSourceFileOfNode(node),
                    appendStatement(node) {
                        statementPatcher.append(node);
                    },
                    prependStatement(node) {
                        statementPatcher.prepend(node);
                    },
                    insertStatementBefore(node, match) {
                        statementPatcher.insertBefore(node, match);
                    },
                    insertStatementAfter(node, match) {
                        statementPatcher.insertAfter(node, match);
                    }
                }
            };

            hook(api);

            if(remove) {
                return factory.createVoidZero();
            }

            if(replacement) {
                return replacement;
            }

            return node;
        }, node);
    }


    export function transformCallExpressionMacro(context: TransformationContext, statementPatcher: SourceFileStatementsPatcher, node: MacroCallExpressionNode): Node | undefined {
        const declaration = getMacroBinding("function", node);
        if(!declaration) return node;

        const hooks = getHooksForMacro<"function", FunctionMacro>(declaration, (hooks) => ({
            declaration,
            ...createTransformMacroApi(hooks),
            ...createCheckApi(hooks)
        }));

        if(!hooks) return node;

        return executeTransformHook(hooks, context, node, statementPatcher);
    }

    export function transformTaggedTemplateExpressionMacro(context: TransformationContext, statementPatcher: SourceFileStatementsPatcher, node: MacroTaggedTemplateExpressionNode): Node | undefined {
        const declaration = getMacroBinding("taggedTemplate", node);
        if(!declaration) return node;

        const hooks = getHooksForMacro<"taggedTemplate", TaggedTemplateMacro>(declaration, (hooks) => ({
            declaration,
            ...createTransformMacroApi(hooks),
            ...createCheckApi(hooks)
        }));

        if(!hooks) return node;

        return executeTransformHook(hooks, context, node, statementPatcher);
    }

    export function transformClassDerivesMacros(context: TransformationContext, statementPatcher: SourceFileStatementsPatcher, node: ClassDeclaration): ClassDeclaration | undefined {
        const deriveMacrosDeclarations = getDeriveMacros(node);

        let result = node;

        for(let declaration of deriveMacrosDeclarations) {
            const hooks = getHooksForMacro<"derive", DeriveMacro<any>>(declaration, (hooks) => ({
                declaration,
                ...createTransformMacroApi(hooks),
                ...createCheckApi(hooks)
            }));


            if(!hooks) continue;

            const hookResult = executeTransformHook(hooks, context, result, statementPatcher) as ClassDeclaration | undefined;

            if(!hookResult) return undefined;

            result = hookResult;
        }

        return result;
    }

}
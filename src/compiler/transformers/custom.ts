/*@internal*/
namespace ts {
    function getDeferExecutor(factory: NodeFactory, isAsync: boolean) {

        let callDeferExpression = factory.createCallExpression(factory.createIdentifier("__defer_fun"), [], []) as Expression;
        if(isAsync) {
            callDeferExpression = factory.createAwaitExpression(callDeferExpression);
        }

        const callDeferFunction = factory.createExpressionStatement(callDeferExpression);

        return factory.createForOfStatement(
            undefined,
            factory.createVariableDeclarationList(
                [factory.createVariableDeclaration(
                    factory.createIdentifier("__defer_fun"),
                    undefined,
                    undefined,
                    undefined
                )],
                ts.NodeFlags.Let
            ),
            factory.createIdentifier("__defer"),
            factory.createBlock(
                [callDeferFunction],
                true
            )
        );
    }

    export function transformMetaprogramImports(context: TransformationContext) {
        const Path = require("path") as typeof import("path");

        const options = context.getCompilerOptions();
        const metaprogramSourceFiles = getMetaprogramSourceFiles();

        return (sourceFile: SourceFile) => {
            if(options.metaprogram) return sourceFile;

            const visitor = (node: Node): VisitResult<Node> => {
                // remove imports to files that import "compiler" (ignore type imports)
                if(isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
                    if(isStringLiteral(node.moduleSpecifier)) {
                        if(pathIsRelative(node.moduleSpecifier.text)) {
                            const importPath = Path.join(Path.dirname(sourceFile.fileName), node.moduleSpecifier.text);

                            if(metaprogramSourceFiles.includes(importPath + ".ts") || metaprogramSourceFiles.includes(importPath + ".tsx")) {
                                return undefined;
                            }
                        }
                    }
                }

                return visitEachChild(node, visitor, context);
            };

            return visitEachChild(sourceFile, visitor, context);
        };
    }

    export function transformMetaprogramReferences(context: TransformationContext) {
        return (sourceFile: SourceFile) => {
            const statementPatcher = new SourceFileStatementsPatcher();

            const visitor = (node: Node): VisitResult<Node> => {
                if(isClassDeclaration(node)) {
                    return transformClassDerivesMacros(context, statementPatcher, visitEachChild(node, visitor, context));
                }

                if(isMacroCallExpressionNode(node)) {
                    const binding = getMacroBinding("function", node);
                    if(binding) {
                        return transformCallExpressionMacro(context, statementPatcher, visitEachChild(node, visitor, context));
                    }
                }

                if(isMacroTaggedTemplateExpressionNode(node)) {
                    const binding = getMacroBinding("taggedTemplate", node);
                    if(binding) {
                        return transformTaggedTemplateExpressionMacro(context, statementPatcher, visitEachChild(node, visitor, context));
                    }
                }

                if(node) {
                    return visitEachChild(node, visitor, context);
                }

                return node;
            };

            return statementPatcher.patch(context.factory, visitEachChild(sourceFile, visitor, context));
        };
    }

    function findChild<T extends Node>(node: Node, finder: (node: Node) => node is T): T | undefined {
        if(finder(node)) {
            return node;
        }

        return forEachChild(node, child => {
            if(isBlock(child) && node.parent && isFunctionLike(node.parent)) {
                return;
            }

            return findChild(child, finder);
        });
    }

    export function transformDeferStatements(context: TransformationContext) {
        return (sourceFile: SourceFile) => {
            const visitor = (node: Node): VisitResult<Node> => {
                if(isDeferStatement(node)) {
                    const fn = findAncestor(node, isFunctionLike);
                    const isAsync = fn && isAsyncFunction(fn);

                    return factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createIdentifier("__defer"),
                            "push"
                        ),
                        [],
                        [
                            factory.createArrowFunction(isAsync ? [
                                factory.createModifier(SyntaxKind.AsyncKeyword)
                            ] : [], [], [], undefined, undefined, factory.createBlock([
                                visitEachChild(node.body, visitor, context)
                            ]))
                        ]
                    );
                }
                if (isBlock(node) && isFunctionLike(node.parent)) {
                    if(findChild(node, isDeferStatement)) {
                        const isAsync = node.parent ? isAsyncFunction(node.parent) : false;

                        return factory.createBlock([
                            factory.createVariableStatement(
                                undefined,
                                factory.createVariableDeclarationList(
                                    [factory.createVariableDeclaration(
                                        factory.createIdentifier("__defer"),
                                        undefined,
                                        factory.createArrayTypeNode(factory.createTypeReferenceNode(
                                            factory.createIdentifier("Function"),
                                            undefined
                                        )),
                                        factory.createArrayLiteralExpression(
                                            [],
                                            false
                                        )
                                    )],
                                    NodeFlags.Const
                                )
                            ),
                            factory.createTryStatement(visitEachChild(node, visitor, context), undefined, factory.createBlock([
                                getDeferExecutor(factory, isAsync)
                            ], /* multiline */ true))
                        ], node.multiLine);
                    }
                }

                return visitEachChild(node, visitor, context);
            };

            return visitEachChild(sourceFile, visitor, context);
        };
    }

    export function transformOperatorOverloading(context: TransformationContext) {
        return (sourceFile: SourceFile) => {
            const visitor = (node: Node): VisitResult<Node> => {
                let newNode: Node = node;

                if(isBinaryExpression(node)) {
                    const operator = node.left.metaFacts?.operator;
                    if(operator) {
                        newNode = factory.createCallExpression(
                            factory.createPropertyAccessExpression(
                                node.left,
                                operator
                            ),
                            [],
                            [node.right]
                        )
                    }
                }

                return visitEachChild(newNode, visitor, context);
            };

            return visitEachChild(sourceFile, visitor, context);
        };
    }
}

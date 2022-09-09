/*@internal*/
namespace ts {
    function getDeferCallExpression(factory: NodeFactory, isAsync: boolean) {
        let callDeferExpression = factory.createCallExpression(factory.createIdentifier("__defer"), [], []) as Expression;
        if(isAsync) {
            callDeferExpression = factory.createAwaitExpression(callDeferExpression);
        }

        const callDeferFunction = factory.createExpressionStatement(callDeferExpression);

        return callDeferFunction;
    }

    function insertDeferCall(statements: Statement[], callDeferFunction: Statement) {
        const returnStatementIndex = statements.findIndex(statement => isReturnStatement(statement));

        if(returnStatementIndex > -1) {
            const beforeReturnStatements = statements.slice(0, returnStatementIndex);
            const afterReturnStatements = statements.slice(returnStatementIndex);

            return [...beforeReturnStatements, callDeferFunction, ...afterReturnStatements];
        }

        return statements;
    }

    function getBlockVisitor(callDeferFunction: Statement, context: TransformationContext) {
        const v = (node: Node): Node => {
            if(isBlock(node) && !isFunctionBlock(node)) {
                const newStatements = insertDeferCall(Array.from(node.statements), callDeferFunction);
                return visitEachChild(context.factory.createBlock(newStatements), v, context);
            }

            return visitEachChild(node, v, context);
        };
        return v;
    };

    export function transformCustomSyntax(context: TransformationContext) {
        return (sourceFile: SourceFile) => {
            const visitor = (node: Node): VisitResult<Node> => {
                if(isFunctionBody(node)) {
                    const deferStatements = node.statements.filter(statement => isDeferStatement(statement)) as DeferStatement[];

                    if(deferStatements.length > 0) {
                        const isAsync = isAsyncFunction(node.parent);

                        const deferredContent = deferStatements.map(x => x.body);
                        const deferFunction = context.factory.createFunctionDeclaration(
                            isAsync ? [context.factory.createModifier(SyntaxKind.AsyncKeyword)] : [],
                            /*asteriskToken*/ undefined,
                            "__defer",
                            [],
                            [],
                            /*type*/ undefined,
                            context.factory.createBlock(deferredContent, /*multiLine*/ true)
                        );

                        const callDeferFunction = getDeferCallExpression(context.factory, isAsync);
                        const blockVisitor = getBlockVisitor(callDeferFunction, context);


                        const statements = node.statements.filter(statement => !isDeferStatement(statement)).map(statement => blockVisitor(statement) as Statement);
                        const newStatements = insertDeferCall(statements, callDeferFunction);

                        return context.factory.updateBlock(node, [
                            ...newStatements,
                            deferFunction
                        ]);
                    }
                }

                return visitEachChild(node, visitor, context);
            };

            return visitEachChild(sourceFile, visitor, context);
        };
    }
}

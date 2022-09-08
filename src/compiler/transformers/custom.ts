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

    export function transformCustomSyntax(context: TransformationContext) {
        return (sourceFile: SourceFile) => {

            const visitBlock = (callDeferFunction: Statement) => (node: Node): Node => {
                if(isBlock(node) && !isFunctionBlock(node)) {
                    const returnStatementIndex = node.statements.findIndex(statement => isReturnStatement(statement));
                    if(returnStatementIndex > -1) {
                        const beforeReturnStatements = node.statements.slice(0, returnStatementIndex);
                        const afterReturnStatements = node.statements.slice(returnStatementIndex);



                        return visitEachChild(context.factory.createBlock([...beforeReturnStatements, callDeferFunction, ...afterReturnStatements]), visitBlock(callDeferFunction), context);
                    }
                }

                return visitEachChild(node, visitBlock(callDeferFunction), context);
            };

            const visitor = (node: Node): VisitResult<Node> => {
                if(isFunctionBody(node)) {
                    const isAsync = isAsyncFunction(node.parent);

                    const deferStatements = node.statements.filter(statement => isDeferStatement(statement)) as DeferStatement[];
                    const deferredContent = deferStatements.map(x => x.body);
                    const deferFunction = context.factory.createFunctionDeclaration(isAsync ? [context.factory.createModifier(SyntaxKind.AsyncKeyword)] : [], /*asteriskToken*/ undefined, "__defer", [], [], /*type*/ undefined, context.factory.createBlock(deferredContent));

                    const callDeferFunction = getDeferCallExpression(context.factory, isAsync);

                    if(deferStatements.length > 0) {
                        const statements = node.statements.filter(statement => !isDeferStatement(statement)).map(statement => visitBlock(callDeferFunction)(statement) as Statement);

                        const returnStatementIndex = statements.findIndex(statement => isReturnStatement(statement));

                        const beforeReturnStatements = statements.slice(0, returnStatementIndex);
                        const afterReturnStatements = statements.slice(returnStatementIndex);

                        return context.factory.updateBlock(node, [
                            ...beforeReturnStatements,
                            callDeferFunction,
                            ...afterReturnStatements,
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

namespace ts {
    type TransformNode<T extends Node> = T & {
        replace(node: Node): void;
        remove(): void;
    };

    interface TransformApi<T extends Node> {
        node: TransformNode<T>;
        factory: NodeFactory;
        context: TransformationContext;
        sourceFile: SourceFile;
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

    export function executeTransformHook(hooks: MacroHooks<Node>, context: TransformationContext, node: Node) {
        return hooks.transform.reduce((node, hook) => {
            let replacement: Node | undefined;
            let remove = false;

            const api: TransformApi<Node> = {
                node: {
                    ...node,
                    replace(newNode) {
                        replacement = newNode;
                    },
                    remove() {
                        remove = true;
                    }
                },
                factory,
                context,
                sourceFile: getSourceFileOfNode(node)
            };

            hook(api);

            if(remove) {
                return undefined;
            }

            if(replacement) {
                return replacement;
            }

            return node;
        }, node);
    }
}
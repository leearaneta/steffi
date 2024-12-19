// Core exports
export { DependencyGraph } from './DependencyGraph';
// Optional visualization export
let GraphRegistry;
try {
    GraphRegistry = require('@steffi/viz').GraphRegistry;
}
catch {
    GraphRegistry = class {
        static getInstance() {
            throw new Error('Visualization functionality requires @steffi/viz package. Install it with: npm install @steffi/viz');
        }
    };
}
export { GraphRegistry };
//# sourceMappingURL=index.js.map
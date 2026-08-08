/**
 * Stands in for Node's `https`, which `@switchboard-xyz/common`'s axios wrapper
 * imports to build `new https.Agent({ maxSockets: 100 })` at module scope. An
 * empty stub would throw on import, before any request is made.
 *
 * The agent is inert here by design rather than by omission: axios uses its XHR
 * adapter on React Native and ignores `httpsAgent` entirely, so connection
 * pooling is the platform's to decide. Keeping the options makes that visible
 * to anyone who inspects the instance.
 */
class Agent {
    constructor(options) {
        this.options = options ?? {};
    }
}

module.exports = { Agent, default: { Agent } };

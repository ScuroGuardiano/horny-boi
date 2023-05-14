import { ok } from 'node:assert/strict';

export const LuaLib = {
    print: (...args) => {
        return console.log(...args);
    },
    type: v => typeof v,
    assert: ok
}

export class LuaContext {
    constructor() {
        Object.keys(LuaLib).forEach(k => this.globals.set(k, LuaLib[k]));
    }

    /**
     * @type { Map<string, any> }
     */
    globals = new Map();

    /**
     * @param { { [key: string]: any } } values
     */
    assignGlobal(values) {
        Object.keys(values).forEach(k => this.globals.set(k, values[k]));
    }

    getGlobal(key) {
        return this.globals.get(key) ?? null;
    }

    declareGlobalFn(key, fn) {
        this.globals.set(key, fn);
    }

    callGlobalFn(key, ...args) {
        const fn = this.globals.get(key);
        if (typeof fn !== "function") {
            throw new TypeError(`[LuaContext] ${key} is not a function.`);
        }
        return fn(...args);
    }
}

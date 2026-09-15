#!/usr/bin/env node
/**
 * Reset local ops JSON store to a clean Maw3ed demo seed.
 * Usage: node scripts/reset-ops-data.js
 */
const path = require("path");

// Clear require cache so a previous dirty in-memory store cannot linger in the same process.
const storeModule = path.join(__dirname, "..", "opsStore.js");
delete require.cache[require.resolve(storeModule)];
const ops = require(storeModule);

const result = ops.resetOpsData();
console.log(JSON.stringify({ ok: true, action: "reset-ops-data", ...result }, null, 2));

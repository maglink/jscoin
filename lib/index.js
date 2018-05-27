"use strict";

let sqlite;
process.on('uncaughtException', err => {
    sqlite.close();
    throw err;
});

sqlite = require('sqlite-sync');
let config = require("./config");

module.exports.init = function(mainPath, configPath) {
    config.load(mainPath, configPath);

    sqlite.connect(config.data.storage.file);
    sqlite.run(`PRAGMA auto_vacuum = FULL;`, (res) => {
        if (res.error) throw res.error;
    });

    module.exports.config = config;
    module.exports.blocks = require("./blocks");

    module.exports.transactions = require("./transactions");
    module.exports.peers = require("./peers");
    let Miner = require("./mining").Miner;
    module.exports.miner = new Miner();

    let address = module.exports.transactions.getAddressFromPubKey(module.exports.config.data.wallet.pubKey);
    module.exports.transactions.validateAddress(address);
    console.log(address);
};

"use strict";

let config = require("./config");
let dbInit = require("./database");

module.exports.init = function(mainPath, configPath) {
    config.load(mainPath, configPath);

    console.log(config.data.storage.file);
    let db = dbInit(config.data.storage.file);
    process.on('uncaughtException', err => {
        db.close();
        throw err;
    });

    module.exports.config = config;
    module.exports.blocks = require("./blocks");
    module.exports.transactions = require("./transactions");
    module.exports.peers = require("./peers");
    let Miner = require("./mining").Miner;
    module.exports.miner = new Miner();

    module.exports.transactions.storage.cleanUpUnconfirmedTrxs();

    let address = module.exports.transactions.getAddressFromPubKey(module.exports.config.data.wallet.pubKey);
    module.exports.transactions.validateAddress(address);
    module.exports.transactions.storage.watchAddress(address);

    console.log(address);
};

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

    let blocks = require("./blocks");
    let transactions = require("./transactions");
    let peers = require("./peers");

    blocks.storage.onChangeLastBlock(() => {
        transactions.storage.cleanUpUnconfirmedTrxs();
    });

    let address = transactions.getAddressFromPubKey(config.data.wallet.pubKey);
    transactions.validateAddress(address);
    transactions.storage.watchAddress(address);

    module.exports.config = config;
    module.exports.blocks = blocks;
    module.exports.transactions = transactions;
    module.exports.peers = peers;
    let Miner = require("./mining").Miner;
    module.exports.miner = new Miner();

    delete module.exports.init;
};

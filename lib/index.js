"use strict";

module.exports.init = function(mainPath, configPath) {
    module.exports.config = require("./config");
    module.exports.config.load(mainPath, configPath);
    module.exports.blocks = require("./blocks");
    module.exports.transactions = require("./transactions");
    module.exports.peers = require("./peers");
    let Miner = require("./mining").Miner;
    module.exports.miner = new Miner();


    let address = module.exports.transactions.getAddressFromPubKey(module.exports.config.data.wallet.pubKey);
    module.exports.transactions.validateAddress(address);
    console.log(address);
};
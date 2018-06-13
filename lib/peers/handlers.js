"use strict";

let config = require("../config");
let debug = require("../debug");
let blocksModule = require("../blocks");
let transactionsModule = require("../transactions");
let methods = require("./methods");
let antispam = require("./antispam");
let timeout = require("./timeout");
let storage = require("./storage");
let validator = require('validator');

let syncFlow = {};

module.exports.ItsMeError = new Error("It's me");

module.exports.helloHandler = function(socket, info) {
    debug.log(socket.peerId, "handler", "helloHandler");

    if(socket.greeted) {
        socket.destroy(new Error("double greeting"));
        return;
    }
    if(!info || info.app !== "jscoin") {
        socket.destroy(new Error("Incorrect app name"));
        return;
    }
    if(info.id === methods.helloId) {
        socket.destroy(module.exports.ItsMeError);
        return;
    }
    socket.greeted = true;
    socket.appVersion = info.version;
    methods.peersList(socket);
    if(!socket.isGuest) {
        methods.lastBlock(socket);
    }
};

module.exports.lastBlockHandler = function(socket, block) {
    antispam.check("lastBlock", socket, 5);
    timeout.response("lastBlock", socket);
    debug.log(socket.peerId, "handler", "lastBlockHandler");

    try {
        if (blocksModule.storage.getLastBlock().header.height < block.header.height) {
            if (!syncFlow.socket || syncFlow.socket.destroyed) {
                syncFlow.socket = socket;
                syncFlow.startHeight = blocksModule.storage.getLastBlock().header.height;
                syncFlow.blocks = [];
                methods.compareBlocks(socket, blocksModule.storage.getLastBlockHeader())
            }
        }
    } catch (e) {
        debug.log("Invalid block from peer: ", e.message);
        socket.destroy(new Error("block invalid"));
    }
};

module.exports.compareBlocksHandler = function(socket, block) {
    antispam.check("compareBlocks", socket, 5);
    debug.log(socket.peerId, "handler", "compareBlocksHandler");

    try {
        let myBlock = blocksModule.storage.getBlockByHeight(block.header.height);
        methods.compareResult(socket, block.header.height, myBlock.hash === block.hash);
    } catch (e) {
        debug.log("Invalid block from peer: ", e.message);
        socket.destroy(new Error("block invalid"));
    }
};

module.exports.compareResultHandler = function(socket, body) {
    antispam.check("compareResult", socket, 5);
    timeout.response("compareBlocks", socket);
    debug.log(socket.peerId, "handler", "compareResultHandler");

    if(syncFlow.socket !== socket) {
        return;
    }

    try {
        if(body.height === 1 && !body.result) {
            syncFlow = {};
            socket.destroy(new Error("first block not eq"));
            return;
        }

        if(body.result) {
            methods.loadBlocks(socket, body.height+1)
        } else {
            let nextCompareHeight = syncFlow.startHeight - (syncFlow.startHeight - body.height)*2;
            if(nextCompareHeight === syncFlow.startHeight) {
                nextCompareHeight--;
            }
            if(nextCompareHeight < 1) {
                nextCompareHeight = 1;
            }
            setTimeout(() => {
                methods.compareBlocks(socket, blocksModule.storage.getBlockHeaderByHeight(nextCompareHeight))
            }, 200);
        }
    } catch (e) {
        debug.log("Compare result handler error: ", e.message);
        socket.destroy(new Error("compare error"));
    }
};

module.exports.loadBlocksHandler = function(socket, body) {
    antispam.check("loadBlocks", socket, 20);
    debug.log(socket.peerId, "handler", "loadBlocksHandler");

    try {
        methods.blocks(socket, blocksModule.storage.getBlocks(body.from), blocksModule.storage.getBlocksHeight())
    } catch (e) {
        debug.log("Load block request error: ", e.message);
        socket.destroy(new Error("load blocks error"));
    }
};

module.exports.blocksHandler = function(socket, body) {
    antispam.check("blocks", socket, 20);
    timeout.response("loadBlocks", socket);
    debug.log(socket.peerId, "handler", "blocksHandler");

    if(syncFlow.socket !== socket) {
        return;
    }

    try {
        let blocks = body.blocks;
        for(let i=0;i<blocks.length;i++){
            let block = blocks[i];
            blocksModule.addBlock(block);
        }
        if(blocks.length === 0 || body.maxHeight < blocks[blocks.length - 1].header.height+1) {
            syncFlow = {};
        } else {
            setTimeout(() => {
                methods.loadBlocks(socket, blocks[blocks.length - 1].header.height+1)
            }, 50);
        }
    } catch(e) {
        debug.log("Invalid block from peer: ", e.message);
        syncFlow = {};
        socket.destroy(new Error("block invalid"));
    }
};

module.exports.transactionHandler = function(socket, trxData) {
    antispam.check("transaction", socket, antispam.MAX_TRANSACTIONS_PER_SECOND);
    debug.log(socket.peerId, "handler", "transactionHandler");

    let trx;
    try {
        trx = transactionsModule.Transaction.fromData(trxData);
        transactionsModule.storage.addTransaction(trx, socket.peerId);
    } catch(e) {
        debug.log("Invalid trx from peer: ", e.message);
        socket.destroy(new Error("transaction invalid"));
    }
};

module.exports.peersListHandler = function(socket, peersList) {
    antispam.check("peersList", socket, 5, 30000);
    debug.log(socket.peerId, "handler", "peersListHandler");

    try {
        peersList.forEach(address => {
            if(validator.isURL(address)) {
                storage.savePeer(address);
            }
        })
    } catch(e) {
        debug.log("Invalid peers list: ", e.message);
        syncFlow = {};
        socket.destroy(new Error("peers list invalid"));
    }
};
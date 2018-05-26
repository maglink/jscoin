"use strict";

let config = require("../config");
let blocksModule = require("../blocks");
let transactionsModule = require("../transactions");
let methods = require("./methods");
let main = require("../peers");

let syncFlow = {};

module.exports.helloHandler = function(socket, info) {
    console.log(socket.peerId, "handler", "helloHandler");
    if(!info || info.app !== "jscoin") {
        socket.end();
        return;
    }
    socket.appVersion = info.version;
    methods.lastBlock(socket);
};

module.exports.lastBlockHandler = function(socket, block) {
    console.log(socket.peerId, "handler", "lastBlockHandler");
    if(blocksModule.storage.getLastBlock().header.height < block.header.height) {
        if(!syncFlow.socket || syncFlow.socket.destroyed){
            syncFlow.socket = socket;
            syncFlow.startHeight = blocksModule.storage.getLastBlock().header.height;
            syncFlow.blocks = [];
            methods.compareBlocks(socket, blocksModule.storage.getLastBlockHeader())
        }
    }
};

module.exports.compareBlocksHandler = function(socket, block) {
    console.log(socket.peerId, "handler", "compareBlocksHandler");
    let myBlock = blocksModule.storage.getBlockByHeight(block.header.height);
    methods.compareResult(socket, block.header.height, myBlock.hash === block.hash);
};

module.exports.compareResultHandler = function(socket, body) {
    console.log(socket.peerId, "handler", "compareResultHandler");
    if(syncFlow.socket !== socket) {
        return;
    }
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
        methods.compareBlocks(socket, blocksModule.storage.getBlockHeaderByHeight(nextCompareHeight))
    }
};

module.exports.loadBlocksHandler = function(socket, body) {
    console.log(socket.peerId, "handler", "loadBlocksHandler");
    methods.blocks(socket, blocksModule.storage.getBlocks(body.from), blocksModule.storage.getBlocksHeight())
};

module.exports.blocksHandler = function(socket, body) {
    console.log(socket.peerId, "handler", "blocksHandler");
    if(syncFlow.socket !== socket) {
        return;
    }

    let blocks = body.blocks;

    for(let i=0;i<blocks.length;i++){
        let block = blocks[i];
        try {
            blocksModule.addBlock(block);
        } catch(e) {
            console.log("Invalid block from peer: ", e.message);
            syncFlow = {};
            socket.destroy(new Error("block invalid"));
            return;
        }
    }

    blocksModule.storage._saveBlocks();

    if(blocks.length === 0 || body.maxHeight < blocks[blocks.length - 1].header.height+1) {
        syncFlow = {};
    } else {
        methods.loadBlocks(socket, blocks[blocks.length - 1].header.height+1)
    }
};

module.exports.transactionHandler = function(socket, trxData) {
    console.log(socket.peerId, "handler", "transactionHandler");

    let trx;
    try {
        trx = transactionsModule.Transaction.fromData(trxData);
        transactionsModule.storage.addTransaction(trx);
    } catch(e) {
        console.log("Invalid trx from peer: ", e.message);
        socket.destroy(new Error("transaction invalid"));
        return;
    }

    main.newTransaction(trx, socket);
};
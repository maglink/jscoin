"use strict";

let config = require("../config");
let blocks = require("../blocks");
let storage = require("./storage");
let timeout = require("./timeout");

module.exports.helloId = "" + Math.random();

module.exports.hello = function(socket) {
    socket.write({method: "hello", body: {
        app: "jscoin",
        version: "1.0",
        id: module.exports.helloId
    }})
};

module.exports.lastBlock = function(socket) {
    socket.write({method: "lastBlock", body: blocks.storage.getLastBlockHeader()})
};

module.exports.compareBlocks = function(socket, block) {
    socket.write({method: "compareBlocks", body: block});
    timeout.request("compareBlocks", socket);
};

module.exports.compareResult = function(socket, height, result) {
    socket.write({method: "compareResult", body: {
        height: height,
        result: result
    }})
};

module.exports.loadBlocks = function(socket, from) {
    socket.write({method: "loadBlocks", body: {
        from: from
    }});
    timeout.request("loadBlocks", socket);
};

module.exports.blocks = function(socket, blocks, maxHeight) {
    socket.write({method: "blocks", body: {
        blocks: blocks,
        maxHeight: maxHeight
    }})
};

module.exports.transaction = function(socket, transaction) {
    socket.write({method: "transaction", body: transaction})
};

module.exports.peersList = function(socket) {
    socket.write({method: "peersList", body: storage.getRandomPeers()})
};
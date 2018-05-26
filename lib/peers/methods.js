"use strict";

let config = require("../config");
let blocks = require("../blocks");

module.exports.hello = function(socket) {
    socket.write({method: "hello", body: {
        app: "jscoin",
        version: "1.0"
    }})
};

module.exports.lastBlock = function(socket) {
    socket.write({method: "lastBlock", body: blocks.storage.getLastBlockHeader()})
};

module.exports.compareBlocks = function(socket, block) {
    socket.write({method: "compareBlocks", body: block})
};

module.exports.compareResult = function(socket, height, result) {
    socket.write({method: "compareResult", body: {
        height: height,
        result: result
    }})
};

module.exports.loadBlocks = function(socket, from, to) {
    socket.write({method: "loadBlocks", body: {
        from: from,
        to: to
    }})
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
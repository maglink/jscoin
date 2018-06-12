"use strict";

let topology = require("fully-connected-topology");
let jsonStream = require("duplex-json-stream");
let streamSet = require("stream-set");

let config = require("../config");
let handlers = require("./handlers");
let methods = require("./methods");
let transactions = require("../transactions");
let antispam = require("./antispam");
let storage = require("./storage");
let timeout = require("./timeout");

let swarm = topology(config.data.address, []);
let streams = streamSet();

const TIMEOUT_WITHOUT_HELLO = 2000;
const TIMEOUT_FOR_GUEST = 3000;
const CONNECTIONS_CHECK_INTERVAL = 5000;
const PROPAGATE_TRXS_INTERVAL = 500;
const MAX_CONNECTIONS = 8;
const LAST_BLOCK_SEND_INTERVAL = 30000;

swarm.on("connection", (socket, peerId) => {
    socket = jsonStream(socket);
    streams.add(socket);
    socket.peerId = peerId;

    socket.on("data", (data) => {
        if(!data || typeof data.method !== "string"){
            return;
        }
        if(typeof handlers[data.method+"Handler"] !== "function") {
            return;
        }
        if(data.method !== "hello" && (!socket.greeted || socket.isGuest)) {
            return;
        }
        try {
            handlers[data.method+"Handler"](socket, data.body);
        } catch (e) {
            socket.destroy(e);
        }
    });

    let lastBlockInterval = setInterval(() => {
        methods.lastBlock(socket);
        timeout.request("lastBlock", socket, LAST_BLOCK_SEND_INTERVAL);
    }, LAST_BLOCK_SEND_INTERVAL);

    console.log("connected:", socket.peerId);
    console.log("connections:", swarm.connections.length);

    socket.on("error", (err) => {
        console.error("connection error:", socket.peerId, err);
        storage.savePeer(socket.peerId, true, err);
    });

    socket.on("close", () => {
        if(lastBlockInterval) {
            clearInterval(lastBlockInterval);
        }
        swarm.remove(socket.peerId);
        setTimeout(() => {
            console.log("disconnected:", socket.peerId);
            console.log("connections:", swarm.connections.length);
        }, 0);
    });

    setTimeout(() => {
        if(!socket.greeted && !socket.destroyed) {
            socket.destroy(new Error("Greeting timeout"));
        }

        if(socket.greeted) {
            storage.savePeer(socket.peerId, true);
        }
    }, TIMEOUT_WITHOUT_HELLO);

    if(swarm.connections.length > MAX_CONNECTIONS) {
        socket.isGuest = true;
        setTimeout(()=>{
            socket.destroy();
        }, TIMEOUT_FOR_GUEST);
    }

    methods.hello(socket);
});

setInterval(() => {
    if(swarm.connections.length < MAX_CONNECTIONS) {
        let nodes = storage.getRandomPeers();
        nodes.forEach((address) => {
            swarm.add(address);
        });
    }
}, CONNECTIONS_CHECK_INTERVAL);

setInterval(() => {
    let {trx, peers} = transactions.storage._getUnconfirmedTrxUnpropagated();
    if(!trx) {
        return;
    }

    let trxPeers = module.exports.newTransaction(trx, peers);
    if(trxPeers.length > peers.length) {
        transactions.storage._saveUnconfirmedTrxPeers(trx, trxPeers);
    }
}, PROPAGATE_TRXS_INTERVAL);

module.exports.newBlockFound = function() {
    streams.streams.forEach((socket) => {
        methods.lastBlock(socket);
    })
};

module.exports.newTransaction = function(trx, processedPeers) {
    let canISend = antispam.sendTransaction();
    if(!canISend) {
        return processedPeers;
    }

    let trxPeers = processedPeers.slice();
    streams.streams.forEach((socket) => {
        if(processedPeers.indexOf(socket.peerId) === -1) {
            methods.transaction(socket, trx);
            trxPeers.push(socket.peerId);
        }
    });
    return trxPeers;
};

transactions.storage.onTransactionsAdded((trx, sourcePeerId) => {
    let trxPeers = sourcePeerId ? [sourcePeerId] : [];
    trxPeers = module.exports.newTransaction(trx, trxPeers);
    transactions.storage._saveUnconfirmedTrxPeers(trx, trxPeers);
});

config.data.nodes.forEach(address => {
    storage.savePeer(address);
});

module.exports.getList = function() {
    return streams.streams.map((socket) => socket.peerId);
};
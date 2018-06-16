"use strict";

let topology = require("./topology");
let jsonStream = require("duplex-json-stream");
let streamSet = require("stream-set");

let config = require("../config");
let debug = require("../debug");
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

swarm.on("connection", (socket, peerId, type, addressForConnections) => {
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
        timeout.request("lastBlock", socket, LAST_BLOCK_SEND_INTERVAL + 4000);
    }, LAST_BLOCK_SEND_INTERVAL);

    let greetingError = new Error("Greeting timeout");
    let helloTimeout = setTimeout(() => {
        if(socket.destroyed) return;
        if(!socket.greeted) {
            socket.destroy(greetingError);
        } else {
            storage.savePeer(addressForConnections, type !== "client");
        }
    }, TIMEOUT_WITHOUT_HELLO);

    debug.log("connected:", socket.peerId);
    debug.log("connections:", swarm.connections.length);

    socket.on("error", (err) => {
        debug.log("connection error:", socket.peerId, err);
        if( err === handlers.ItsMeError || err === greetingError) {
            if(type !== "client") {
                storage.deletePeer(peerId);
            }
        } else {
            if(type !== "client") {
                storage.savePeer(socket.peerId, true, err);
            }
        }
    });

    socket.on("close", () => {
        if(lastBlockInterval) {
            clearInterval(lastBlockInterval);
        }
        if(helloTimeout) {
            clearTimeout(helloTimeout);
        }
        swarm.remove(socket.peerId);
        setTimeout(() => {
            debug.log("disconnected:", socket.peerId);
            debug.log("connections:", swarm.connections.length);
        }, 0);
    });

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
        if(!nodes.length) {
            nodes = config.data.nodes;
        }
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

module.exports.getList = function() {
    return streams.streams.map((socket) => socket.peerId);
};
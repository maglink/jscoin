"use strict";

let topology = require("fully-connected-topology");
let jsonStream = require("duplex-json-stream");
let streamSet = require("stream-set");

let config = require("../config");
let handlers = require("./handlers");
let methods = require("./methods");
let transactions = require("../transactions");

let swarm = topology(config.data.address, config.data.nodes);
let streams = streamSet();

const TIMEOUT_WITHOUT_HELLO = 1000;
const PROPAGATE_TRXS_INTERVAL = 1000;

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
        if(data.method !== "hello" && !socket.greeted) {
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
    }, 30000);

    console.log("connected:", socket.peerId);
    console.log("connections:", swarm.connections.length);

    socket.on("error", (err) => {
        console.error("connection error:", socket.peerId, err);
    });

    socket.on("close", () => {
        if(lastBlockInterval) {
            clearInterval(lastBlockInterval);
        }
        setTimeout(() => {
            console.log("disconnected:", socket.peerId);
            console.log("connections:", swarm.connections.length);
        }, 0);
    });

    methods.hello(socket);
    setTimeout(() => {
        if(!socket.greeted && !socket.destroyed) {
            socket.destroy(new Error("Greeting timeout"));
        }
    }, TIMEOUT_WITHOUT_HELLO)

    (function sendSomeTrxs() {
        setTimeout(() => {
            let {trx, peers} = transactions.storage._getUnconfirmedTrxUnpropagated();
            if(socket.destroyed || !trx) {
                return;
            }

            let trxPeers = module.exports.newTransaction(trx, peers);
            transactions.storage._saveUnconfirmedTrxPeers(trx, trxPeers);

            sendSomeTrxs();
        }, PROPAGATE_TRXS_INTERVAL);
    })();
});

module.exports.newBlockFound = function() {
    streams.streams.forEach((socket) => {
        methods.lastBlock(socket);
    })
};

module.exports.newTransaction = function(trx, processedPeers) {
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
    trxPeers = module.exports.newTransaction(trx.getData(), trxPeers);
    transactions.storage._saveUnconfirmedTrxPeers(trx.getData(), trxPeers);
});

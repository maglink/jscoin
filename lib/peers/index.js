"use strict";

let topology = require("fully-connected-topology");
let jsonStream = require("duplex-json-stream");
let streamSet = require("stream-set");

let config = require("../config");
let handlers = require("./handlers");
let methods = require("./methods");

let swarm = topology(config.data.address, config.data.nodes);
let streams = streamSet();

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
});


module.exports.newBlockFound = function() {
    streams.streams.forEach((socket) => {
        methods.lastBlock(socket);
    })
};

module.exports.newTransaction = function(trx, sourceSocket) {
    streams.streams.forEach((socket) => {
        if(sourceSocket !== socket) {
            methods.transaction(socket, trx);
        }
    })
};
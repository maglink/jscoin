"use strict";

let debug = require("../debug");

const TIMEOUT = 4000;

module.exports.request = function(name, socket, customTimeout) {
    if(!socket.timeouts) {
        socket.timeouts = {};
    }

    if(socket.timeouts[name]) {
       return;
    }

    socket.timeouts[name] = setTimeout(() => {
        socket.destroy(new Error("Request timeout: " + name))
    }, customTimeout || TIMEOUT);
};

module.exports.response = function(name, socket) {
    if(!socket.timeouts) {
        socket.timeouts = {};
    }

    if(socket.timeouts[name]) {
        clearTimeout(socket.timeouts[name]);
        delete socket.timeouts[name];
    }
};

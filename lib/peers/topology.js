'use strict';

let net = require('net');
let events = require('events');
let util = require('util');
let url = require('url');
let lpmessage = require('length-prefixed-message');

let attachCleanup = function(self, peer, socket) {
    socket.on('close', function() {
        if (peer.socket === socket) peer.socket = null;
        if (peer.pendingSocket === socket) peer.pendingSocket = null;
        if (peer.socket) return;

        if (!peer.host) return delete self.peers[peer.id];
    });
};

let errorHandle = function(self, socket) {
    socket.on('error', function() {
        socket.destroy();
    });

    socket.setTimeout(15000, function() { // 15s to do the handshake
        socket.destroy();
    });
};

let onready = function(self, peer, socket) {
    socket.setTimeout(0); // reset timeout
    let oldSocket = peer.socket;
    peer.socket = socket;
    peer.pendingSocket = null;
    if (oldSocket) oldSocket.destroy();
    self.emit('connection', peer.socket, peer.id, peer.type, peer.addressForConnections);
};

let checkPeerRandom = function(self, socket, peerId, otherRandom) {
    if(otherRandom === self.random) {
        self.me[peerId] = true;
        socket.destroy();
        return
    }

    for(let key in self.peers) {
        if(self.peers[key].random === otherRandom) {
            socket.destroy();
            return
        }
    }

    return true;
};

let onconnection = function(self, socket) {
    errorHandle(self, socket);
    lpmessage.read(socket, function(data) {
        let remoteAddress = socket.remoteAddress;
        if(remoteAddress.startsWith("::ffff:")) {
            remoteAddress = remoteAddress.substr(7)
        }
        let peerId = remoteAddress + ":" + socket.remotePort;

        let random = data.toString().split("#")[0];
        let port = data.toString().split("#")[1];
        if(!checkPeerRandom(self, socket, remoteAddress + ":" + port, random)) {
            return;
        }

        let peer = self.peers[peerId] = self.peers[peerId] || {
            id:peerId,
            random: random,
            addressForConnections: remoteAddress + ":" + port,
            type: "client"
        };
        lpmessage.write(socket, self.random + "#" + self.port);
        attachCleanup(self, peer, socket);
        onready(self, peer, socket);
    });
};

let connect = function(self, peer, socket) {
    if (peer.socket || peer.pendingSocket) return socket && socket.destroy();
    if (peer.reconnectTimeout) clearTimeout(peer.reconnectTimeout);

    if (!socket) socket = net.connect({
        port: peer.port,
        host: peer.host,
        //localPort: self.port
    });
    lpmessage.write(socket, self.random + "#" + self.port);
    peer.pendingSocket = socket;

    errorHandle(self, socket);
    attachCleanup(self, peer, socket);

    lpmessage.read(socket, function(data) {
        let random = data.toString().split("#")[0];
        if(!checkPeerRandom(self, socket, peer.id, random)) {
            return;
        }
        peer.random = random;
        peer.addressForConnections = peer.host + ":" + peer.port;
        peer.type = "server";
        onready(self, peer, socket);
    });
};

let Topology = function(port) {
    port = Number(port);
    if (!(this instanceof Topology)) return new Topology(port);
    if (/^\d+$/.test(port)) {
        this.port = port;
        this.me = {};
        this.random = Math.random() + '';
        this.peers = {};
        this.server = null;
        this.listen(port);
        events.EventEmitter.call(this);
    }
};

util.inherits(Topology, events.EventEmitter);

Topology.prototype.__defineGetter__('connections', function() {
    let peers = this.peers;
    return Object.keys(peers)
        .map(function(id) {
            return peers[id].socket;
        })
        .filter(function(socket) {
            return socket;
        });
});

Topology.prototype.peer = function(addr) {
    return (this.peers[addr] && this.peers[addr].socket) || null;
};

Topology.prototype.listen = function(port) {
    let self = this;

    this.server = net.createServer(function(socket) {
        onconnection(self, socket);
    });

    this.server.listen(port);
};

Topology.prototype.add = function(addr) {
    if(this.me[addr]) return;

    let splitResult = addr.split(":");
    let peer = this.peers[addr] = this.peers[addr] || {id:addr};

    peer.host = splitResult.slice(0, -1).join(":");
    peer.port = splitResult.slice(-1)[0];
    peer.reconnectTimeout = peer.reconnectTimeout || null;
    peer.pendingSocket = peer.pendingSocket || null;
    peer.socket = peer.socket || null;

    connect(this, peer);
};

Topology.prototype.remove = function(addr) {
    let peer = this.peers[addr];
    if (!peer) return;

    delete this.peers[addr];
    peer.host = null; // will stop reconnects
    if (peer.socket) peer.socket.destroy();
    if (peer.pendingSocket) peer.pendingSocket.destroy();
    clearTimeout(peer.reconnectTimeout);
};

Topology.prototype.destroy = function() {
    if (this.server) this.server.close();
    Object.keys(this.peers).forEach(this.remove.bind(this));
};

module.exports = Topology;

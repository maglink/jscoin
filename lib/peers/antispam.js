"use strict";

module.exports.check = function(name, socket, maxCount, perTime) {
    perTime = perTime || 1000;

    if(!socket.antispam) {
        socket.antispam = {};
    }

    if(!socket.antispam[name]) {
        socket.antispam[name] = {};
    }
    if(typeof socket.antispam[name].count !== 'number') {
        socket.antispam[name].count = 0;
    }
    if(!socket.antispam[name].time) {
        socket.antispam[name].time = Date.now();
        socket.antispam[name].count = -1;
    }

    socket.antispam[name].count++;

    if(socket.antispam[name].count >= maxCount) {
        if(Date.now() - socket.antispam[name].time < perTime) {
            socket.destroy(new Error("Too much requests: " + name));
        }

        socket.antispam[name].count = 0;
        socket.antispam[name].time = Date.now();
    }
};

//max blockchain capacity is ~ 6.8 trx/s
module.exports.MAX_TRANSACTIONS_PER_SECOND = 10;

module.exports.sendTransaction = function() {
    if(typeof this.count !== 'number') {
        this.count = 0;
    }
    if(!this.time) {
        this.time = Date.now();
        this.count = -1;
    }

    this.count++;

    if(this.count >= module.exports.MAX_TRANSACTIONS_PER_SECOND - 1) {
        if(Date.now() - this.time < 1000) {
            this.timeout = Date.now();
        }
        this.count = 0;
        this.time = Date.now();
    }

    if(this.timeout && Date.now() - this.timeout < 1000) {
        return false;
    }

    return true;
};
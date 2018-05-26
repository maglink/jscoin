"use strict";

let fs = require("fs");
let config = require("../config");
let main = require("./index");

class Storage {
    constructor() {
        this._UTXOs = {};
        this._loadUTXOs();

        this._memoryPool = [];
        this._memPoolUpdateHanlers = [];

        return this;
    }

    _loadUTXOs() {
        if(!fs.existsSync(config.data.storage.utxos)) {
            return;
        }
        this._UTXOs = JSON.parse((fs.readFileSync(config.data.storage.utxos)).toString());
    }

    _saveUTXOs() {
        fs.writeFileSync(config.data.storage.utxos, JSON.stringify(this._UTXOs, null, 2));
    }

    commitTrxs(trxs) {
        let deletedFromMemPool = false;

        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];

            let fromAddress = trx.body.from;
            if(fromAddress) {
                this._UTXOs[fromAddress] -= trx.body.amount;
                this._UTXOs[fromAddress] -= trx.body.fee;
                if(this._UTXOs[fromAddress] === 0) {
                    delete this._UTXOs[fromAddress];
                }
            }

            if(!this._UTXOs[trx.body.to]) {
                this._UTXOs[trx.body.to] = trx.body.amount;
            } else {
                this._UTXOs[trx.body.to] += trx.body.amount;
            }

            if(!fromAddress) {
                this._UTXOs[trx.body.to] += trx.body.fees;
            }

            if(this._memoryPool[trx.hash]) {
                delete this._memoryPool[trx.hash];
                deletedFromMemPool = true;
            }
        }

        if(deletedFromMemPool) {
            this._memPoolUpdated();
        }
    }

    rollbackTrxs(trxs) {
        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];
            let fromAddress = trx.body.from;
            if(fromAddress) {
                if(!this._UTXOs[fromAddress]) {
                    this._UTXOs[fromAddress] = trx.body.amount;
                } else {
                    this._UTXOs[fromAddress] += trx.body.amount;
                }
                this._UTXOs[fromAddress] += trx.body.fee;
            }

            this._UTXOs[trx.body.to] -= trx.body.amount;
            if(!fromAddress) {
                this._UTXOs[trx.body.to] -= trx.body.fees;
            }
            if(this._UTXOs[trx.body.to] === 0) {
                delete this._UTXOs[trx.body.to];
            }
        }
    }

    validateByUTXOs(trxs) {
        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];
            let fromAddress = trx.body.from;
            if(fromAddress) {
                if(!this._UTXOs[fromAddress] || this._UTXOs[fromAddress] < (trx.body.amount + trx.body.fee)) {
                    throw new Error("Too small balance: " + fromAddress);
                }
            }
        }
    }

    addTransaction(trx) {
        if(!(trx instanceof main.Transaction)) {
            throw new Error("Trx is not instance of Transaction");
        }
        if(trx.isCoinbase()) {
            throw new Error("Trx is coinbase");
        }
        if(!trx.verifySign()) {
            throw new Error("Trx signature not verified");
        }

        let trxData = trx.getData();
        this._memoryPool[trxData.hash] = trxData;
        this._memPoolUpdated();
    }

    getTransactions() {
        return this._memoryPool;
    }

    onTransactionsUpdate(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");

        }
        this._memPoolUpdateHanlers.push(handler);
    }

    _memPoolUpdated() {
        this._memPoolUpdateHanlers.forEach((handler) => {
            handler();
        })
    }

    getAddressBalance(address) {
        return this._UTXOs[address] || 0;
    }
}

module.exports = new Storage();
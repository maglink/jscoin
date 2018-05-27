"use strict";

let fs = require("fs");
let config = require("../config");
let main = require("./index");
let sqlite = require('sqlite-sync');

class Storage {
    constructor() {
        sqlite.run(`CREATE TABLE IF NOT EXISTS utxos (
            address VARCHAR(50) PRIMARY KEY,
            amount UNSIGNED INTEGER
        );`, function (res) {
            if (res.error) throw res.error;
        });

        this._memoryPool = [];
        this._memPoolAddHanlers = [];
        this._memPoolUpdateHanlers = [];

        return this;
    }

    _getAddressValue(address) {
        let result = sqlite.run(`SELECT amount 
            FROM utxos
            WHERE address = "${address}";`);
        if (!result || !result[0]) {
            return 0;
        }
        return result[0].amount;
    }

    _setAddressValue(address, amount) {
        if(amount) {
            sqlite.run(`INSERT OR REPLACE INTO utxos(address, amount)
                VALUES("${address}", ${amount});`, (res) => {
                if (res.error) throw res.error;
            });
        } else {
            sqlite.run(`DELETE FROM utxos
                WHERE address = "${address}"`, (res) => {
                if (res.error) throw res.error;
            });
        }
    }

    commitTrxs(trxs) {
        this.validateByUTXOs(trxs);

        let deletedFromMemPool = false;

        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];

            let fromAddress = trx.body.from;
            let toAddress = trx.body.to;
            let toAddressAmount = this._getAddressValue(toAddress);

            if(fromAddress) {
                this._setAddressValue(fromAddress,
                    this._getAddressValue(fromAddress) - trx.body.amount - trx.body.fee);
            } else {
                toAddressAmount += trx.body.fees;
            }

            this._setAddressValue(toAddress, toAddressAmount + trx.body.amount);

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
            let toAddress = trx.body.to;
            let toAddressAmount = this._getAddressValue(toAddress);

            if(fromAddress) {
                this._setAddressValue(fromAddress,
                    this._getAddressValue(fromAddress) + trx.body.amount + trx.body.fee);
            } else {
                toAddressAmount -= trx.body.fees;
            }

            this._setAddressValue(toAddress, toAddressAmount - trx.body.amount);
        }
    }

    validateByUTXOs(trxs) {
        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];
            let fromAddress = trx.body.from;
            if(fromAddress) {
                if(this._getAddressValue(fromAddress) < (trx.body.amount + trx.body.fee)) {
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
        this._memPoolAdded();
        this._memPoolUpdated();
    }

    getTransactions() {
        return this._memoryPool;
    }

    onTransactionsAdded(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");

        }
        this._memPoolAddHanlers.push(handler);
    }

    onTransactionsUpdate(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");

        }
        this._memPoolUpdateHanlers.push(handler);
    }

    _memPoolAdded() {
        this._memPoolAddHanlers.forEach((handler) => {
            handler();
        })
    }

    _memPoolUpdated() {
        this._memPoolUpdateHanlers.forEach((handler) => {
            handler();
        })
    }
}

module.exports = new Storage();
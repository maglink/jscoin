"use strict";

let fs = require("fs");
let config = require("../config");
let main = require("./index");
let db = require("../database");

class Storage {
    constructor() {
        db.prepare(`CREATE TABLE IF NOT EXISTS trxs (
            hash CHARACTER(64) PRIMARY KEY,
            height UNSIGNED INTEGER NOT NULL
        );`).run();

        db.prepare(`CREATE TABLE IF NOT EXISTS trxs_unconfirmed (
            hash CHARACTER(64) PRIMARY KEY,
            timestamp UNSIGNED INTEGER NOT NULL,
            data TEXT NOT NULL
        );`).run();

        db.prepare(`CREATE TABLE IF NOT EXISTS utxos (
            address VARCHAR(50) PRIMARY KEY,
            amount UNSIGNED INTEGER
        );`).run();

        db.prepare(`CREATE TABLE IF NOT EXISTS trx_watching (
            address VARCHAR(50) NOT NULL,
            trx_hash CHARACTER(64) NOT NULL,
            trx_timestamp UNSIGNED INTEGER,
            block_height UNSIGNED INTEGER,
            change INTEGER NOT NULL,
            fee UNSIGNED INTEGER NOT NULL, 
            PRIMARY KEY (address, trx_hash)
        );`).run();

        this._memPoolAddHanlers = [];
        this._addressesForWatching = {};

        return this;
    }

    resetDB() {
        db.prepare(`DELETE FROM trxs;`).run();
        db.prepare(`DELETE FROM trxs_unconfirmed;`).run();
        db.prepare(`DELETE FROM utxos;`).run();
        db.prepare(`DELETE FROM trx_watching;`).run();
    }

    watchAddress(address) {
        this._addressesForWatching[address] = true;
    }

    unwatchAddress(address) {
        this._addressesForWatching[address] = false;
    }

    _saveTrxWatching(address, trx, blockHeight) {
        if(trx.body.from !== address && trx.body.to !== address){
            return;
        }

        blockHeight = blockHeight || null;

        let change = 0;
        let fee = 0;
        if(trx.body.from === address) {
            change -= trx.body.amount;
            fee = trx.body.fee;
        }

        if(trx.body.to === address) {
            if(!trx.body.from) {
                change += trx.body.fees;
            }
            change += trx.body.amount;
        }

        db.prepare(`INSERT OR REPLACE INTO trx_watching(address, trx_hash, trx_timestamp, block_height, change, fee)
                VALUES(?, ?, ?, ?, ?, ?);`).run(address, trx.hash, trx.body.timestamp, blockHeight, change, fee);
    }

    _getTrxsWatchingByAddress(address) {
        return db.prepare(`SELECT * FROM trx_watching
            WHERE address = ?
            ORDER BY CASE WHEN block_height IS NULL THEN 0 ELSE 1 END,
                block_height DESC, trx_timestamp DESC`)
            .all(address);
    }

    _checkAndSaveTrxWatching(trx, blockHeight) {
        if(trx.body.from && this._addressesForWatching[trx.body.from]){
            this._saveTrxWatching(trx.body.from, trx, blockHeight)
        }
        if(trx.body.from !== trx.body.to && this._addressesForWatching[trx.body.to]) {
            this._saveTrxWatching(trx.body.to, trx, blockHeight)
        }
    }

    createUTXOsChecker() {
        return new UTXOsChecker();
    }

    _saveTrx(trx, blockHeight) {
        db.prepare(`INSERT INTO trxs (hash, height) VALUES (?, ?);`)
            .run(trx.hash, blockHeight);

        this._checkAndSaveTrxWatching(trx, blockHeight);
    }

    _getTrxBlockHeight(trx) {
        let item = db.prepare(`SELECT height 
            FROM trxs WHERE hash = ?;`).get(trx.hash);
        if (!item) {
            return 0;
        }
        return item.height;
    }

    _deleteTrx(trx) {
        db.prepare(`DELETE FROM trxs WHERE hash = ?`)
            .run(trx.hash);
    }

    _saveUnconfirmedTrx(trx) {
        db.prepare(`INSERT OR REPLACE INTO trxs_unconfirmed(hash, timestamp, data)
            VALUES(?, ?, ?);`).run(trx.hash, Date.now(), JSON.stringify(trx));

        this._checkAndSaveTrxWatching(trx);
    }

    getUnconfirmedTrxs(offset, limit) {
        if (!limit) {
            limit = 100;
        }

        let result = db.prepare(`SELECT data FROM trxs_unconfirmed
            ORDER BY timestamp ASC LIMIT ? OFFSET ?`).all(limit, offset);

        let trxs = [];
        for (let i = 0; i < result.length; i++) {
            trxs.push(JSON.parse(result[i].data));
        }
        return trxs;
    }

    _deleteUnconfirmedTrx(trx) {
        db.prepare(`DELETE FROM trxs_unconfirmed WHERE hash = ?`)
            .run(trx.hash);
    }

    _getAddressValue(address) {
        let item = db.prepare(`SELECT amount 
            FROM utxos WHERE address = ?`).get(address);
        if (!item) {
            return 0;
        }
        return item.amount;
    }

    _setAddressValue(address, amount) {
        if(amount) {
            db.prepare(`INSERT OR REPLACE INTO utxos(address, amount)
                VALUES(?, ?);`).run(address, amount);
        } else {
            db.prepare(`DELETE FROM utxos WHERE address = ?`).run(address);
        }
    }

    cleanUpUnconfirmedTrxs() {
        let checker = this.createUTXOsChecker();
        let offset = 0;
        let trxsForRemove = [];
        while(1) {
            let trxs = this.getUnconfirmedTrxs(offset);
            if(!trxs.length) {
                break;
            }
            offset += trxs.length;
            for(let i=0;i<trxs.length;i++) {
                try {
                    let trx = main.Transaction.fromData(trxs[i]);
                    this._validateUnconfirmedTrx(trx);
                    checker.addTrx(trx.getData())
                } catch (e) {
                    trxsForRemove.push(trxs[i])
                }
            }
        }

        for(let i=0;i<trxsForRemove.length;i++) {
            this._deleteUnconfirmedTrx(trxsForRemove[i]);
        }
    }

    validateTrxsByUTXOs(trxs) {
        let checker = this.createUTXOsChecker();
        for(let i=0;i<trxs.length;i++) {
            checker.addTrx(trxs[i])
        }
    }

    _commitTrx(trx, blockHeight) {
        this._saveTrx(trx, blockHeight);
        this._deleteUnconfirmedTrx(trx);

        try {
            let toAddress = trx.body.to;
            let toAddressAmount = this._getAddressValue(toAddress);
            if(trx.body.from) {
                let fromAddress = trx.body.from;
                let fromAddressAmount = this._getAddressValue(fromAddress);
                if(fromAddressAmount < (trx.body.amount + trx.body.fee)) {
                    throw new Error("Too small balance: " + fromAddress);
                }
                this._setAddressValue(fromAddress, fromAddressAmount - trx.body.amount - trx.body.fee);
                this._setAddressValue(toAddress, toAddressAmount + trx.body.amount);
            } else {
                this._setAddressValue(toAddress, toAddressAmount + trx.body.amount + trx.body.fees);
            }
        } catch (e) {
            this._deleteTrx(trx);
            if(trx.body.from) {
                this._saveUnconfirmedTrx(trx);
            }
            throw e;
        }
    }

    _rollbackTrx(trx) {
        this._deleteTrx(trx);
        if(trx.body.from) {
            this._saveUnconfirmedTrx(trx);
        }

        let toAddress = trx.body.to;
        let toAddressAmount = this._getAddressValue(toAddress);
        if(trx.body.from) {
            let fromAddress = trx.body.from;
            let fromAddressAmount = this._getAddressValue(fromAddress);

            this._setAddressValue(fromAddress, fromAddressAmount + trx.body.amount + trx.body.fee);
            this._setAddressValue(toAddress, toAddressAmount - trx.body.amount);
        } else {
            this._setAddressValue(toAddress, toAddressAmount - trx.body.amount - trx.body.fees);
        }
    }

    commitTrxs(block) {
        let trxs = block.trxs;
        let blockHeight = block.header.height;

        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];
            try {
                this._commitTrx(trx, blockHeight);
            } catch (e) {
                for(let j=i-1;j>=0;j--) {
                    let trx = trxs[j];
                    this._rollbackTrx(trx);
                }
                throw e;
            }
        }
    }

    rollbackTrxs(block) {
        let trxs = block.trxs;
        for(let i=0;i<trxs.length;i++) {
            let trx = trxs[i];
            this._rollbackTrx(trx);
        }
    }

    addTransaction(trx) {
        this._validateUnconfirmedTrx(trx);
        this._saveUnconfirmedTrx(trx.getData());
        this._memPoolAdded();
    }

    _validateUnconfirmedTrx(trx) {
        if(!(trx instanceof main.Transaction)) {
            throw new Error("Trx is not instance of Transaction");
        }
        if(trx.isCoinbase()) {
            throw new Error("Trx must not be coinbase");
        }
        if(!trx.verifySign()) {
            throw new Error("Trx signature not verified");
        }
        if(this._getTrxBlockHeight(trx.getData())) {
            throw new Error("Trx already in blockchain");
        }
    }

    onTransactionsAdded(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");

        }
        this._memPoolAddHanlers.push(handler);
    }

    _memPoolAdded() {
        this._memPoolAddHanlers.forEach((handler) => {
            handler();
        })
    }
}


let storage = new Storage();
module.exports = storage;

class UTXOsChecker {
    constructor() {
        this._addresses = {}
    }

    addTrx(trx) {
        let toAddress = trx.body.to;
        if(typeof this._addresses[toAddress] === 'undefined') {
            this._addresses[toAddress] = storage._getAddressValue(toAddress);
        }
        let toAddressAmount = this._addresses[toAddress];

        if(trx.body.from) {
            let fromAddress = trx.body.from;
            if(typeof this._addresses[fromAddress] === 'undefined') {
                this._addresses[fromAddress] = storage._getAddressValue(fromAddress);
            }
            let fromAddressAmount = this._addresses[fromAddress];
            if(fromAddressAmount < (trx.body.amount + trx.body.fee)) {
                throw new Error("Too small balance: " + fromAddress);
            }
            this._addresses[fromAddress] = fromAddressAmount - trx.body.amount - trx.body.fee;
            this._addresses[toAddress] = toAddressAmount + trx.body.amount;
        } else {
            this._addresses[toAddress] = toAddressAmount + trx.body.amount + trx.body.fees;
        }
    }
}
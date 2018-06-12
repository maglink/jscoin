"use strict";

let main = require("./index");
let db = require("../database");

const MIN_PEERS_COUNT = 3;

class Storage {
    constructor() {
        db.prepare(`CREATE TABLE IF NOT EXISTS trxs (
            hash CHARACTER(64) PRIMARY KEY,
            height UNSIGNED INTEGER NOT NULL
        );`).run();

        db.prepare(`CREATE TABLE IF NOT EXISTS trxs_unconfirmed (
            hash CHARACTER(64) PRIMARY KEY,
            timestamp UNSIGNED INTEGER NOT NULL,
            address_from VARCHAR(50) NOT NULL,
            address_to VARCHAR(50) NOT NULL,
            data TEXT NOT NULL,
            propagate_count UNSIGNED INTEGER NOT NULL DEFAULT 0,
            propagate_peers TEXT NOT NULL DEFAULT ''
        );`).run();

        db.prepare(`CREATE TABLE IF NOT EXISTS utxos (
            address VARCHAR(50) PRIMARY KEY,
            amount UNSIGNED INTEGER
        );`).run();

        db.prepare(`CREATE TABLE IF NOT EXISTS trx_watching (
            address VARCHAR(50) NOT NULL,
            other_address VARCHAR(50),
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
        let other = null;
        if(trx.body.from === address) {
            change -= trx.body.amount;
            fee = trx.body.fee;
            other = trx.body.to;
        }

        if(trx.body.to === address) {
            if(!trx.body.from) {
                change += trx.body.fees;
            } else {
                other = trx.body.from;
            }
            change += trx.body.amount;
        }

        db.prepare(`INSERT OR REPLACE INTO trx_watching(address, other_address, trx_hash, trx_timestamp, block_height, change, fee)
                VALUES(?, ?, ?, ?, ?, ?, ?);`).run(address, other, trx.hash, trx.body.timestamp, blockHeight, change, fee);
    }

    _getTrxsWatchingByAddress(address, limit, offset) {
        limit = typeof limit === 'number' ? limit : 10;
        offset = typeof offset === 'number' ? offset : 0;
        if(limit <= 0) {
            limit = 1;
        }
        if(limit > 100) {
            limit = 100;
        }
        return db.prepare(`SELECT * FROM trx_watching
            WHERE address = ?
            ORDER BY CASE WHEN block_height IS NULL THEN 0 ELSE 1 END,
                block_height DESC, trx_timestamp DESC LIMIT ? OFFSET ?`)
            .all(address, limit, offset);
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

    getUnconfirmedTrxInfoByHash(hash) {
        let item = db.prepare(`SELECT data 
            FROM trxs_unconfirmed WHERE hash = ?;`).get(hash);
        if(item) {
            item.data = JSON.parse(item.data);
            return item
        }
    }

    getTrxInfoByHash(hash) {
        return db.prepare(`SELECT * FROM trxs WHERE hash = ?;`).get(hash);
    }

    _deleteTrx(trx) {
        db.prepare(`DELETE FROM trxs WHERE hash = ?`)
            .run(trx.hash);
    }

    _saveUnconfirmedTrx(trx) {
        db.prepare(`INSERT OR REPLACE INTO trxs_unconfirmed(hash, timestamp, address_from, address_to, data)
            VALUES(?, ?, ?, ?, ?);`).run(trx.hash, Date.now(), trx.body.from, trx.body.to, JSON.stringify(trx));

        this._checkAndSaveTrxWatching(trx);
    }

    _saveUnconfirmedTrxPeers(trx, peers) {
        db.prepare(`UPDATE trxs_unconfirmed 
            SET propagate_count = ?, propagate_peers = ?
            WHERE hash = ?`).run(peers.length, JSON.stringify(peers), trx.hash);

        this._checkAndSaveTrxWatching(trx);
    }

    _getUnconfirmedTrxUnpropagated() {
        let item = db.prepare(`SELECT data, propagate_peers 
            FROM trxs_unconfirmed
            WHERE propagate_count < ?
            ORDER BY timestamp LIMIT 1`).get(MIN_PEERS_COUNT);
        if (!item) {
            return {};
        }

        let peers = [];
        if(item.propagate_peers) {
            peers = JSON.parse(item.propagate_peers);
        }

        return {trx: JSON.parse(item.data), peers: peers};
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

    _getUnconfirmedTrxsByAddress(address) {
        let result = db.prepare(`SELECT data FROM trxs_unconfirmed
            WHERE address_from = ? OR address_to = ?
            ORDER BY timestamp`).all(address, address);

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

    _validateUnconfirmedTrxByUTXOs(trx) {
        if(!trx.body.from) {
            return;
        }

        let unconfirmedTrxs = this._getUnconfirmedTrxsByAddress(trx.body.from);
        let checker = this.createUTXOsChecker();
        for(let i=0;i<unconfirmedTrxs.length;i++) {
            try {
                let trx = main.Transaction.fromData(unconfirmedTrxs[i]);
                this._validateUnconfirmedTrx(trx);
                checker.addTrx(unconfirmedTrxs[i])
            } catch (e) {
            }
        }

        checker.addTrx(trx);
    }

    getAddressBalance(address) {
        let unconfirmedTrxs = this._getUnconfirmedTrxsByAddress(address);
        let checker = this.createUTXOsChecker();
        for(let i=0;i<unconfirmedTrxs.length;i++) {
            try {
                let trx = main.Transaction.fromData(unconfirmedTrxs[i]);
                this._validateUnconfirmedTrx(trx);
                checker.addTrx(unconfirmedTrxs[i])
            } catch (e) {
            }
        }
        return checker.getBalance(address);
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

    addTransaction(trx, peerId) {
        this._validateUnconfirmedTrx(trx);
        this._validateUnconfirmedTrxByUTXOs(trx.getData());
        this._saveUnconfirmedTrx(trx.getData());
        this._memPoolAdded(trx.getData(), peerId);
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

    removeOnTransactionsAdded(handler) {
        let index = this._memPoolAddHanlers.indexOf(handler);
        if (index > -1) {
            this._memPoolAddHanlers.splice(index, 1);
        }
    }

    _memPoolAdded(trx, peerId) {
        this._memPoolAddHanlers.forEach((handler) => {
            handler(trx, peerId);
        })
    }
}


let storage = new Storage();
module.exports = storage;

class UTXOsChecker {
    constructor() {
        this._addresses = {}
    }

    getBalance(address) {
        if(typeof this._addresses[address] === 'undefined') {
            this._addresses[address] = storage._getAddressValue(address);
        }
        return this._addresses[address];
    }

    setBalance(address, value) {
        this._addresses[address] = value;
    }

    addTrx(trx) {
        let toAddressAmount = this.getBalance(trx.body.to);

        if(trx.body.from) {
            let fromAddressAmount = this.getBalance(trx.body.from);
            if(fromAddressAmount < (trx.body.amount + trx.body.fee)) {
                throw new Error("Too small balance: " + trx.body.from);
            }
            this.setBalance(trx.body.from, fromAddressAmount - trx.body.amount - trx.body.fee);
            this.setBalance(trx.body.to, toAddressAmount + trx.body.amount);
        } else {
            this.setBalance(trx.body.to, toAddressAmount + trx.body.amount + trx.body.fees);
        }
    }
}
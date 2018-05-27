"use strict";

let fs = require("fs");
let config = require("../config");
let transactions = require("../transactions");
let sqlite = require('sqlite-sync');

const GENESIS_BLOCK = {
    "hash": "000063c8c6e3bc35bfd1dca65a9bdcc869f26c8b70e84c48fd44033ae8a0575d",
    "header": {
        "version": 1,
        "height": 1,
        "timestamp": 1527331958128,
        "hashPrevBlock": "",
        "hashMerkleRoot": "0ea27240ba888cca3102e105ab3b6201076afcecc1764c570d8c109aaa2189c1",
        "difficulty": 60,
        "noonce": 88
    },
    "trxs": [
        {
            "hash": "24f041752b42c6283e5cc15f236f6a46304da1edb665d033e2a5bfbc7bcbe795",
            "body": {
                "to": "JSc197SrtfjR6e1cNJBksCGsk3RTWEoAhAkQf",
                "amount": 799999847,
                "fees": 0,
                "timestamp": 1527331868096
            }
        }
    ]
};

class Storage {
    constructor() {
        sqlite.run(`BEGIN;
        CREATE TABLE IF NOT EXISTS blocks (
            hash CHARACTER(64) PRIMARY KEY,
            prev_hash CHARACTER(64),
            chain_hash CHARACTER(64) NOT NULL,
            height UNSIGNED BIG INT NOT NULL,
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS hash_idx ON blocks (hash);
        CREATE INDEX IF NOT EXISTS height_idx ON blocks (height);
        CREATE INDEX IF NOT EXISTS chain_hash_idx ON blocks (chain_hash);
        CREATE UNIQUE INDEX IF NOT EXISTS chain_hash_height_idx ON blocks (chain_hash, height);
        COMMIT;`, function (res) {
            if (res.error) throw res.error;
        });

        let firstBlock = this.getBlockByHeight(1);
        if(!firstBlock || firstBlock.hash !== GENESIS_BLOCK.hash) {
            sqlite.run(`DELETE FROM blocks;`, (res) => {
                if (res.error) throw res.error;
            });

            sqlite.insert("blocks", {
                hash: GENESIS_BLOCK.hash,
                prev_hash: GENESIS_BLOCK.header.hashPrevBlock,
                chain_hash: GENESIS_BLOCK.hash,
                height: GENESIS_BLOCK.header.height,
                data: JSON.stringify(GENESIS_BLOCK)
            }, function (res) {
                if (res.error) throw res.error;
            });

            transactions.storage._UTXOs = {};
            transactions.storage.commitTrxs(GENESIS_BLOCK.trxs);
        }

        this._onChangeLastBlockHandlers = [];
        return this;
    }

    getLastBlock() {
        let result = sqlite.run(`SELECT data 
            FROM blocks
            WHERE chain_hash = "${GENESIS_BLOCK.hash}"
            ORDER BY height DESC LIMIT 1`);
        if (!result || !result[0]) {
            throw new Error("Blocks not found in db");
        }
        return JSON.parse(result[0].data);
    }

    getLastBlockHeader() {
        let lastBlock = this.getLastBlock();
        return {
            "hash": lastBlock.hash,
            "header": lastBlock.header,
        }
    }

    getBlocksHeight() {
        let result = sqlite.run(`SELECT MAX(height) as height 
            FROM blocks
            WHERE chain_hash = "${GENESIS_BLOCK.hash}"`);
        if (!result || !result[0]) {
            throw new Error("Blocks not found in db");
        }
        return result[0].height;
    }

    getBlocks(from, limit) {
        if (!limit) {
            limit = 10;
        }

        let result = sqlite.run(`SELECT data FROM blocks
            WHERE chain_hash = "${GENESIS_BLOCK.hash}"
            AND height >= ${from}
            ORDER BY height ASC LIMIT ${limit}`);

        let blocks = [];
        for (let i = 0; i < result.length; i++) {
            blocks.push(JSON.parse(result[i].data));
        }
        return blocks;
    }

    getBlockByHeight(height) {
        let result = sqlite.run(`SELECT data FROM blocks
            WHERE chain_hash = "${GENESIS_BLOCK.hash}"
            AND height = ${height}
            LIMIT 1`);
        if (!result || !result[0]) {
            return null;
        }
        return JSON.parse(result[0].data);
    }

    getBlockHeaderByHeight(height) {
        let block = this.getBlockByHeight(height);
        if (!block) {
            return null;
        }
        return {
            "hash": block.hash,
            "header": block.header,
        }
    }

    findPrevBlock(block) {
        let result = sqlite.run(`SELECT data, chain_hash FROM blocks
            WHERE hash = "${block.header.hashPrevBlock}"
            AND height = ${block.header.height - 1}
            LIMIT 1`);

        let prevBlock = null, chainHash = null;
        if (!result || !result[0]) {
            return {prevBlock, chainHash}
        }
        prevBlock = JSON.parse(result[0].data);
        chainHash = result[0].chain_hash;
        if (chainHash === GENESIS_BLOCK.hash) {
            chainHash = null;
        }
        return {prevBlock, chainHash}
    }

    addBlock(block) {
        if (block.header.height === 1) {
            throw new Error("Trying to add block with height=1");
        }

        let {prevBlock, chainHash} = this.findPrevBlock(block);
        if (!prevBlock) {
            throw new Error("Previous block not found");
        }

        let currentHeight = this.getBlocksHeight();

        if (chainHash === null && prevBlock.header.height === currentHeight) {
            //add to main chain

            sqlite.insert("blocks", {
                hash: block.hash,
                prev_hash: block.header.hashPrevBlock,
                chain_hash: GENESIS_BLOCK.hash,
                height: block.header.height,
                data: JSON.stringify(block)
            }, function (res) {
                if (res.error) throw res.error;
            });
            transactions.storage.commitTrxs(block.trxs);
            this._executeChangeTopHandlers();

        } else if (chainHash === null && prevBlock.header.height !== currentHeight) {
            //create new side chain

            sqlite.insert("blocks", {
                hash: block.hash,
                prev_hash: block.header.hashPrevBlock,
                chain_hash: block.hash,
                height: block.header.height,
                data: JSON.stringify(block)
            }, function (res) {
                if (res.error) throw res.error;
            });
        } else if (chainHash !== null) {
            //add to exist side chain

            sqlite.run(`DELETE FROM blocks
                WHERE chain_hash = "${chainHash}"
                AND height >= ${block.header.height}`, (res) => {
                if (res.error) throw res.error;
            });

            sqlite.insert("blocks", {
                hash: block.hash,
                prev_hash: block.header.hashPrevBlock,
                chain_hash: chainHash,
                height: block.header.height,
                data: JSON.stringify(block)
            }, function (res) {
                if (res.error) throw res.error;
            });

            if (prevBlock.header.height === currentHeight) {
                this._setMainChain(chainHash);
                this._executeChangeTopHandlers();
            }
        }
    }

    _setMainChain(chainHash) {

        let result = sqlite.run(`SELECT hash, height 
            FROM blocks
            WHERE chain_hash = "${GENESIS_BLOCK.hash}"
            AND height = (
                SELECT MIN(height) FROM blocks 
                WHERE chain_hash = "${chainHash}")`);
        if (!result || !result[0]) {
            throw new Error("Side chain start block not found")
        }
        let startHash = result[0].hash;
        let startHeight = result[0].height;
        let endHeight = this.getBlocksHeight();

        for (let height = endHeight; height >= startHeight; height--) {
            let block = this.getBlockByHeight(height);
            transactions.storage.rollbackTrxs(block.trxs);
        }

        sqlite.run(`UPDATE blocks
            SET chain_hash = "${startHash}"
            WHERE chain_hash = "${GENESIS_BLOCK.hash}"
            AND height >= ${startHeight}`, (res) => {
            if (res.error) throw res.error;
        });

        sqlite.run(`UPDATE blocks
            SET chain_hash = "${GENESIS_BLOCK.hash}"
            WHERE chain_hash = "${chainHash}"`, (res) => {
            if (res.error) throw res.error;
        });

        let newEndHeight = this.getBlocksHeight();

        for (let height = startHeight; height <= newEndHeight; height++) {
            let block = this.getBlockByHeight(height);
            try {
                transactions.storage.commitTrxs(block.trxs);
            } catch (e) {

                //rollback already commited trxs
                for (let j = height - 1; j >= startHeight; j--) {
                    let block = this.getBlockByHeight(j);
                    transactions.storage.rollbackTrxs(block.trxs);
                }

                sqlite.run(`DELETE FROM blocks
                    WHERE chain_hash = "${GENESIS_BLOCK.hash}"
                    AND height >= ${startHeight}`, (res) => {
                    if (res.error) throw res.error;
                });

                sqlite.run(`UPDATE blocks
                    SET chain_hash = "${GENESIS_BLOCK.hash}"
                    WHERE chain_hash = "${startHash}"`, (res) => {
                    if (res.error) throw res.error;
                });

                //restore UTXOs for main chain
                for (let height = startHeight; height <= endHeight; height++) {
                    let block = this.getBlockByHeight(height);
                    transactions.storage.commitTrxs(block.trxs);
                }

                e.message = "Side chain has bad UTXOs: " + e.message;
                throw e;
            }
        }

    }

    onChangeLastBlock(handler) {
        if (typeof handler !== 'function') {
            throw new Error("Handler is not a function");
        }
        this._onChangeLastBlockHandlers.push(handler);
    }

    _executeChangeTopHandlers() {
        this._onChangeLastBlockHandlers.forEach((handler) => {
            handler();
        })
    }

}

module.exports = new Storage();
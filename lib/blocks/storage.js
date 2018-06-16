"use strict";

let db = require("../database");
let transactions = require("../transactions");

const GENESIS_BLOCK = {
    "hash": "00007c108bbff8418615d34c14c9c91c4bbe12af54f4884fc2b17daeea658d3b",
    "header": {
        "version": 1,
        "height": 1,
        "timestamp": 1529187319181,
        "hashPrevBlock": "000123cd5f21b90539594c77c57fce895d97bd9587716cad291f357dc290b7bb",
        "hashMerkleRoot": "3cdbfd3a0f6064cc66aa0d3c111490a7474f1e76dadb689ecce14809b386c148",
        "difficulty": 70,
        "noonce": 481
    },
    "trxs": [
        {
            "hash": "0ffbd8ae81afa55f6bb9f0293db57cd2ad3f7d8218ee5d2599a2b4eb3fdd70b2",
            "body": {
                "to": "JSc1Gq9nTPCqkxkXDy45xZ95ChYVUXjTWZsR9",
                "amount": 7990867581,
                "fees": 0,
                "message": "U.S. and China Expand Trade War as Beijing Matches Trump’s Tariffs",
                "timestamp": 1529187226153
            }
        }
    ]
};

class Storage {
    constructor() {
        db.prepare(`
        CREATE TABLE IF NOT EXISTS blocks (
            hash CHARACTER(64) PRIMARY KEY,
            chain_hash CHARACTER(64) NOT NULL,
            height UNSIGNED INTEGER NOT NULL,
            data TEXT NOT NULL
        );`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS hash_idx ON blocks (hash);`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS height_idx ON blocks (height);`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS chain_hash_idx ON blocks (chain_hash);`).run();
        db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS chain_hash_height_idx ON blocks (chain_hash, height);`).run();

        let firstBlock = this.getBlockByHeight(1);
        if(!firstBlock || firstBlock.hash !== GENESIS_BLOCK.hash) {
            db.prepare(`DELETE FROM blocks;`).run();
            transactions.storage.resetDB();

            db.prepare(`INSERT INTO blocks (hash,chain_hash,height,data) VALUES (?, ?, ?, ?);`)
                .run(GENESIS_BLOCK.hash, GENESIS_BLOCK.hash, GENESIS_BLOCK.header.height, JSON.stringify(GENESIS_BLOCK));

            transactions.storage.commitTrxs(GENESIS_BLOCK);
        }

        this._onChangeLastBlockHandlers = [];
        return this;
    }

    getLastBlock() {
        let item = db.prepare(`
            SELECT data FROM blocks
            WHERE chain_hash = ?
            ORDER BY height DESC LIMIT 1`)
            .get(GENESIS_BLOCK.hash);
        if (!item) {
            throw new Error("Blocks not found in db");
        }
        return JSON.parse(item.data);
    }

    getLastBlockHeader() {
        let lastBlock = this.getLastBlock();
        return {
            "hash": lastBlock.hash,
            "header": lastBlock.header,
        }
    }

    getBlocksHeight() {
        let item = db.prepare(`
            SELECT max(height) as height 
            FROM blocks
            WHERE chain_hash = ?`)
            .get(GENESIS_BLOCK.hash);
        if (!item) {
            throw new Error("Blocks not found in db");
        }
        return item.height;
    }

    getBlocks(from, limit) {
        if (!limit) {
            limit = 10;
        }

        let result = db.prepare(`
            SELECT data FROM blocks
            WHERE chain_hash = ? AND height >= ?
            ORDER BY height ASC LIMIT ?`)
            .all(GENESIS_BLOCK.hash, from, limit);

        let blocks = [];
        for (let i = 0; i < result.length; i++) {
            blocks.push(JSON.parse(result[i].data));
        }
        return blocks;
    }

    getBlockByHeight(height) {
        let item = db.prepare(`
            SELECT data FROM blocks
            WHERE chain_hash = ? AND height = ?
            LIMIT 1`)
            .get(GENESIS_BLOCK.hash, height);
        if (!item) {
            return null;
        }
        return JSON.parse(item.data);
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
        let item = db.prepare(`
            SELECT data, chain_hash FROM blocks
            WHERE hash = ? AND height = ?
            LIMIT 1`)
            .get(block.header.hashPrevBlock, block.header.height - 1);

        let prevBlock = null, chainHash = null;
        if (!item) {
            return {prevBlock, chainHash}
        }
        prevBlock = JSON.parse(item.data);
        chainHash = item.chain_hash;
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

            db.prepare(`INSERT INTO blocks (hash,chain_hash,height,data) VALUES (?, ?, ?, ?);`)
                .run(block.hash, GENESIS_BLOCK.hash, block.header.height, JSON.stringify(block));

            transactions.storage.commitTrxs(block);
            this._executeChangeTopHandlers();

        } else if (chainHash === null && prevBlock.header.height !== currentHeight) {
            //create new side chain

            db.prepare(`INSERT INTO blocks (hash,chain_hash,height,data) VALUES (?, ?, ?, ?);`)
                .run(block.hash, block.hash, block.header.height, JSON.stringify(block));

        } else if (chainHash !== null) {
            //add to exist side chain

            db.prepare(`DELETE FROM blocks
                WHERE chain_hash = ? AND height >= ?`).run(chainHash, block.header.height);

            db.prepare(`INSERT INTO blocks (hash,chain_hash,height,data) VALUES (?, ?, ?, ?);`)
                .run(block.hash, chainHash, block.header.height, JSON.stringify(block));

            if (prevBlock.header.height === currentHeight) {
                this._setMainChain(chainHash);
                this._executeChangeTopHandlers();
            }
        }
    }

    _setMainChain(chainHash) {
        let item = db.prepare(`
            SELECT hash, height 
            FROM blocks
            WHERE chain_hash = ?
            AND height = (
                SELECT MIN(height) FROM blocks 
                WHERE chain_hash = ?)`)
            .get(GENESIS_BLOCK.hash, chainHash);
        if (!item) {
            throw new Error("Side chain start block not found")
        }
        let startHash = item.hash;
        let startHeight = item.height;
        let endHeight = this.getBlocksHeight();

        for (let height = endHeight; height >= startHeight; height--) {
            let block = this.getBlockByHeight(height);
            transactions.storage.rollbackTrxs(block);
        }

        db.prepare(`UPDATE blocks
            SET chain_hash = ?
            WHERE chain_hash = ? AND height >= ?`)
            .run(startHash, GENESIS_BLOCK.hash, startHeight);

        db.prepare(`UPDATE blocks
            SET chain_hash = ?
            WHERE chain_hash = ?`)
            .run(GENESIS_BLOCK.hash, chainHash);

        let newEndHeight = this.getBlocksHeight();

        for (let height = startHeight; height <= newEndHeight; height++) {
            let block = this.getBlockByHeight(height);
            try {
                transactions.storage.commitTrxs(block);
            } catch (e) {

                //rollback already commited blocks
                for (let j = height - 1; j >= startHeight; j--) {
                    let block = this.getBlockByHeight(j);
                    transactions.storage.rollbackTrxs(block);
                }

                db.prepare(`DELETE FROM blocks
                    WHERE chain_hash = ? AND height >= ?`)
                    .run(GENESIS_BLOCK.hash, startHeight);

                db.prepare(`UPDATE blocks
                    SET chain_hash = ?
                    WHERE chain_hash = ?`)
                    .run(GENESIS_BLOCK.hash, startHash);

                //restore UTXOs for main chain
                for (let height = startHeight; height <= endHeight; height++) {
                    let block = this.getBlockByHeight(height);
                    transactions.storage.commitTrxs(block);
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

    removeOnChangeLastBlock(handler) {
        let index = this._onChangeLastBlockHandlers.indexOf(handler);
        if (index > -1) {
            this._onChangeLastBlockHandlers.splice(index, 1);
        }
    }

    _executeChangeTopHandlers() {
        this._onChangeLastBlockHandlers.forEach((handler) => {
            handler();
        })
    }

}

module.exports = new Storage();
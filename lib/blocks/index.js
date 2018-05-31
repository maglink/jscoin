"use strict";

let sha3_256 = require('js-sha3').sha3_256;
let transactions = require("../transactions");
let storage = require("./storage");
let main = require("./index");

const TIME_PER_BLOCK = 60000;
const DIFFICULTY_AVG_BLOCKS = 10;
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 1024;
const BLOCK_MAX_LENGTH = 65536;


module.exports.getBlockMaxLen = function() {
    return BLOCK_MAX_LENGTH;
};
module.exports.getMaxDifficulty = function() {
    return DIFFICULTY_MAX;
};

module.exports.getNextDifficultyByBlock = function(block) {
    if(block.header.height < DIFFICULTY_AVG_BLOCKS+1) {
        return block.header.difficulty;
    }

    let block1 = storage.getBlockByHeight(block.header.height - DIFFICULTY_AVG_BLOCKS);
    let blockTimeDiff = block.header.timestamp - block1.header.timestamp;
    let nowAvgTimePerBlock = blockTimeDiff/DIFFICULTY_AVG_BLOCKS;
    let delta = nowAvgTimePerBlock/TIME_PER_BLOCK;

    let newDifficulty = block.header.difficulty;
    if(delta > 1) {
        newDifficulty--;
    } else if(delta < 1) {
        newDifficulty++;
    }

    if(newDifficulty > DIFFICULTY_MAX) {
        newDifficulty = DIFFICULTY_MAX;
    }
    if(newDifficulty < DIFFICULTY_MIN) {
        newDifficulty = DIFFICULTY_MIN;
    }
    return newDifficulty;
};

module.exports.getRewardByHeight = function(height) {
    let d = height/5256000;
    if(d > 1) {
        d = 1;
    }
    return Math.floor(800000000 * (1 - d))
};

module.exports.getMerkleTreeRoot = function(trxs) {
    let hashes = trxs.map(item => item.hash);
    if(hashes.length % 2 === 1) {
        hashes.push(sha3_256(""))
    }
    while(hashes.length > 1) {
        let nextHashes = [];
        hashes.forEach((item, i) => {
            if(i % 2 !== 0) {
                return;
            }
            let secondItem = hashes[i+1];
            nextHashes.push(sha3_256(item + secondItem));
        });
        hashes = nextHashes;
    }

    return hashes[0];
};

module.exports.getDifficultyFromHash = function(hex) {
    if(!hex.length) {
        return 0
    }
    let difficultySum = 0;
    for (let i in hex) {
        let char = hex[i];
        let number = parseInt(char, 16);
        difficultySum += 16 - number;
        if(number !== 0) {
            break;
        }
    }
    return difficultySum;
};

module.exports.validateBlock = function(block) {
    if(typeof block !== 'object') {
        throw new Error("Block object is invalid");
    }
    if(typeof block.header !== 'object') {
        throw new Error("Block header object is invalid");
    }
    if(!(block.trxs instanceof Array)) {
        throw new Error("Block trx list is not array");
    }

    if(block.header.version !== 1) {
        throw new Error("Block version is not supported");
    }
    if(block.header.height < 2) {
        throw new Error("Block height is less than 2");
    }

    let json = JSON.stringify(block.header);
    let hash = sha3_256(sha3_256(json));

    if(block.hash !== hash) {
        throw new Error("Block 'hash' field is not matched with real");
    }

    let {prevBlock, chainHash} = storage.findPrevBlock(block);
    if(!prevBlock) {
        throw new Error("Previous block not found");
    }

    if(block.header.hashPrevBlock !== prevBlock.hash) {
        throw new Error("Previous block hash not matched with 'hashPrevBlock' field");
    }
    if(block.header.timestamp < prevBlock.header.timestamp) {
        throw new Error("Current block time is less than previous block time");
    }
    if(block.header.difficulty !== main.getNextDifficultyByBlock(prevBlock)) {
        throw new Error("Wrong difficulty. Calculated: ", main.getNextDifficultyByBlock(prevBlock));
    }
    if(block.header.difficulty > main.getDifficultyFromHash(block.hash)) {
        throw new Error("Difficulty from hash is less than block indicate");
    }

    let blockJsonLen = JSON.stringify(block).length;
    if(blockJsonLen > BLOCK_MAX_LENGTH) {
        throw new Error("Block length is gt than max");
    }

    try {
        transactions.validateBlockTrxs(block);
    } catch (e) {
        e.message = "Validate block trxs: " + e.message;
        throw e;
    }

    if(chainHash === null) {
        try {
            transactions.storage.validateTrxsByUTXOs(block.trxs);
        } catch (e) {
            e.message = "Validate block trxs by UTXOs: " + e.message;
            throw e;
        }
    }

    let coinbaseTrx = block.trxs[0];
    if(coinbaseTrx.body.amount !== main.getRewardByHeight(block.header.height)) {
        throw new Error("Coinbase amount is invalid");
    }

    if(block.header.hashMerkleRoot !== main.getMerkleTreeRoot(block.trxs)) {
        throw new Error("Merkle tree root is invalid");
    }
};

module.exports.addBlock = function(block) {
    main.validateBlock(block);
    storage.addBlock(block);
};

module.exports.storage = storage;
"use strict";

let sha3_256 = require('js-sha3').sha3_256;
let transactions = require("../transactions");
let storage = require("./storage");
let difficultyModule = require("./difficulty");
let main = require("./index");

const BLOCK_MAX_LENGTH = 1048576;
const TIME_PER_BLOCK = 600000;
const RECALCULATE_TARGET_BLOCKS = 144;

module.exports.getBlockMaxLen = function() {
    return BLOCK_MAX_LENGTH;
};

module.exports.getNextTargetByBlock = function(block) {
    if(block.header.height === 1|| block.header.height % RECALCULATE_TARGET_BLOCKS !== 1) {
        return block.header.target;
    }

    let blockFrom = storage.getBlockByHeight(block.header.height - RECALCULATE_TARGET_BLOCKS);
    let timeDiff = block.header.timestamp - blockFrom.header.timestamp;
    let avgTimePerBlock = Math.floor(timeDiff/RECALCULATE_TARGET_BLOCKS);
    let difficulty = difficultyModule.getDifficultyFromTarget(block.header.target);
    let newDifficulty = difficulty/(avgTimePerBlock/TIME_PER_BLOCK);
    return difficultyModule.getTargetFromDifficulty(newDifficulty);
};

module.exports.getNetworkHashrate = function() {
    let lastBlock = storage.getLastBlockHeader();
    let nextTarget = main.getNextTargetByBlock(lastBlock);
    let difficulty = difficultyModule.getDifficultyFromTarget(nextTarget);
    return difficulty * Math.pow(16, 11) / 0xffffff / (TIME_PER_BLOCK/1000);
};

module.exports.getAvgBlockFound = function(hashrate) {
    let lastBlock = storage.getLastBlockHeader();
    let difficulty = difficultyModule.getDifficultyFromTarget(lastBlock.header.target);
    return (difficulty * Math.pow(16, 11) / 0xffffff / hashrate) * 1000;
};

module.exports.getRewardByHeight = function(height) {
    let d = height/525600;
    if(d > 1) {
        d = 1;
    }
    return Math.floor(7990882785 * (1 - d))
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

    if(block.header.timestamp > Date.now() + 1000) {
        throw new Error("Block timestamp is too big");
    }
    if(block.header.target !== main.getNextTargetByBlock(prevBlock)) {
        throw new Error("Wrong target. Calculated: ", main.getNextTargetByBlock(prevBlock));
    }
    if(!difficultyModule.checkHashByTarget(block.hash, block.header.target)) {
        throw new Error("Block hash not matched with target");
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
module.exports.difficulty = difficultyModule;
"use strict";

let fs = require("fs");
let path = require("path");
let config = require("../config");
let transactions = require("../transactions");

const GENESIS_BLOCK = {
    "hash": "000063c8c6e3bc35bfd1dca65a9bdcc869f26c8b70e84c48fd44033ae8a0575d",
    "header": {
        "version": 1,
        "height": 1,
        "timestamp": 1527331958128,
        "hashPrevBlock": "",
        "hashMerkleRoot": "0ea27240ba888cca3102e105ab3b6201076afcecc1764c570d8c109aaa2189c1",
        "difficulty": 65,
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

const MAX_SIDE_CHAINS = 8;
const BLOCKS_IN_FILE = 5;
const MAX_BLOCKS_IN_MEMORY = 10;
const BLOCKS_FILE_DELIMITER = "-";

class Storage {
    constructor() {
        this._blocks = {};
        this._lastBlockHeight = 0;
        this._sideChains = [];
        this._onChangeLastBlockHandlers = [];
        this._loadBlocks();
        return this;
    }

    getLastBlock() {
        return this._blocks[this._lastBlockHeight];
    }

    getLastBlockHeader() {
        let lastBlock = this.getLastBlock();
        return {
            "hash": lastBlock.hash,
            "header": lastBlock.header,
        }
    }

    getBlocksHeight() {
        return this._lastBlockHeight;
    }

    getBlocks(from, to) {
        if(!to) {
            to = from + 9;
        }

        let blocks = [];
        for(let height = from; height <= to; height++) {
            let block = this.getBlockByHeight(height);
            if(!block) {
                break;
            }
            blocks.push(block);
        }

        return blocks;
    }

    getBlockByHeight(height) {
        let block = this._blocks[height];
        if(!block) {
            block = this._loadBlockByHeight(height);
        }
        return block;
    }

    getBlockHeaderByHeight(height) {
        let block = this.getBlockByHeight(height);
        return {
            "hash": block.hash,
            "header": block.header,
        }
    }

    findPrevBlock(block) {
        let chainNum = null;
        let prevBlock = this.getBlockByHeight(block.header.height - 1);
        if(!prevBlock
            || prevBlock.header.height !== block.header.height - 1
            || block.header.hashPrevBlock !== prevBlock.hash){

            prevBlock = null;

            for(let i=0;i<this._sideChains.length;i++) {
                let sideChain = this._sideChains[i];
                let sideChainBlock = sideChain.blocks[sideChain.blocks.length-1];

                if(sideChainBlock.header.height === block.header.height - 1
                    && sideChainBlock.hash === block.header.hashPrevBlock) {
                    prevBlock = sideChainBlock;
                    chainNum = i;
                    break;
                }
            }
        }
        return [prevBlock, chainNum]
    }

    addBlock(block) {
        if(block.header.height === 1) {
            throw new Error("Trying to add block with height=1");
        }
        if(block.header.height <= this.getLastBlock().header.height) {
            this._addBlockToSideChain(block);
        } else {
            let prevBlock = this.getBlockByHeight(block.header.height - 1);
            if(!prevBlock
                || prevBlock.header.height !== block.header.height - 1
                || block.header.hashPrevBlock !== prevBlock.hash){
                this._addBlockToSideChain(block);
            } else {
                this._blocks[block.header.height] = block;
                transactions.storage.commitTrxs(block.trxs);
                this._executeChangeTopHandlers();
            }
        }
    }

    _addBlockToSideChain(block) {
        let result = this.findPrevBlock(block);
        let prevBlock = result[0];
        let chainNum = result[1];

        if(!prevBlock) {
            throw new Error("Previous block not found");
        }

        if(chainNum === null) {
            this._sideChains.push({
                height: block.header.height,
                blocks: [block]
            });

            if(this._sideChains.length > MAX_SIDE_CHAINS) {
                this._sideChains.shift();
            }
        } else {
            this._sideChains[chainNum].blocks.push(block);
            this._sideChains[chainNum].height = block.header.height;

            if(this._sideChains[chainNum].height > this.getLastBlock().header.height) {
                try {
                    this._setMainChain(chainNum);
                } catch (e) {
                    e.message = "Set main chain: " + e.message;
                    throw e;
                }
            }
        }
    }

    _setMainChain(chainNum) {
        if(this._sideChains[chainNum].height <= this.getLastBlock().header.height) {
            throw new Error("Side chain height is less than main");
        }

        if(this._sideChains[chainNum].badUTXOs) {
            throw new Error("Side chain has bad UTXOs");
        }

        let firstBlock = this._sideChains[chainNum].blocks[0];

        let prevBlock = this.getBlockByHeight(firstBlock.header.height - 1);
        if(!prevBlock
            || prevBlock.header.height !== firstBlock.header.height - 1
            || firstBlock.header.hashPrevBlock !== prevBlock.hash){
            throw new Error("Previous block is invalid");
        }

        let newSideChain = this.getBlocks(prevBlock.header.height, this.getBlocksHeight());

        for(let i=newSideChain.length-1;i>=0;i--) {
            let block = newSideChain[i];
            transactions.storage.rollbackTrxs(block.trxs);
        }

        for(let i=0;i<this._sideChains[chainNum].blocks.length;i++) {
            let block = this._sideChains[chainNum].blocks[i];
            try {
                transactions.storage.validateByUTXOs(block.trxs)
            } catch (e) {
                this._sideChains[chainNum].badUTXOs = true;

                for(let j=i-1;j>=0;j--) {
                    let block = this._sideChains[chainNum].blocks[j];
                    transactions.storage.rollbackTrxs(block.trxs);
                }

                for(let i=0;i<newSideChain.length;i++) {
                    let block = newSideChain[i];
                    transactions.storage.commitTrxs(block.trxs);
                }

                e.message = "Side chain has bad UTXOs: " + e.message;
                throw e;
            }
            transactions.storage.commitTrxs(block.trxs);
        }

        for(let i=0;i<this._sideChains[chainNum].blocks.length;i++) {
            let block = this._sideChains[chainNum].blocks[i];
            this._blocks[block.header.height] = block;
        }

        this._sideChains[chainNum].blocks = newSideChain;
        this._sideChains[chainNum].height = newSideChain[newSideChain.length-1].header.height;

        this._saveBlocks();
        this._executeChangeTopHandlers();
    }

    onChangeLastBlock(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");
        }
        this._onChangeLastBlockHandlers.push(handler);
    }

    _executeChangeTopHandlers() {
        this._onChangeLastBlockHandlers.forEach((handler) => {
            handler();
        })
    }

    _loadBlocks() {
        let pathObj = path.parse(config.data.storage.blocks);
        delete pathObj.root;
        delete pathObj.base;
        let baseName = pathObj.name;

        let lastFile;

        for(let i=0;;i++) {
            pathObj.name = baseName + BLOCKS_FILE_DELIMITER + (BLOCKS_IN_FILE*i+1);
            let file = path.format(pathObj);
            if(!fs.existsSync(file)) {
                if(i===0) {
                    this._createFirstBlocksFile(file);
                } else {
                    this._lastBlockHeight = this._loadBlocksFromFile(lastFile);
                }
                this._executeChangeTopHandlers();
                return;
            }
            lastFile = file;
        }
    }

    _createFirstBlocksFile() {
        this._blocks = {1: GENESIS_BLOCK};
        this._lastBlockHeight = 1;
        transactions.storage._UTXOs = {};
        transactions.storage.commitTrxs(GENESIS_BLOCK.trxs);
        this._saveBlocks();
    }

    _loadBlockByHeight(height) {
        let pathObj = path.parse(config.data.storage.blocks);
        delete pathObj.root;
        delete pathObj.base;
        let baseName = pathObj.name;
        pathObj.name = baseName + BLOCKS_FILE_DELIMITER + (height - ((height-1)%BLOCKS_IN_FILE));
        let file = path.format(pathObj);
        this._loadBlocksFromFile(file);
        return this._blocks[height];
    }

    _loadBlocksFromFile(file) {
        if(!fs.existsSync(file)) {
            return 0;
        }

        let blocks = JSON.parse((fs.readFileSync(file)).toString());

        if(Object.keys(this._blocks).length + BLOCKS_IN_FILE > MAX_BLOCKS_IN_MEMORY) {
            this._saveBlocks();
            this._blocks = {};
        }

        let maxBlockHeight = 0;
        for(let i=0;i<blocks.length;i++) {
            let block = blocks[0];
            this._blocks[block.header.height] = block;
            if(block.header.height > maxBlockHeight) {
                maxBlockHeight = block.header.height;
            }
        }

        return maxBlockHeight;
    }

    _saveBlocks() {
        let pathObj = path.parse(config.data.storage.blocks);
        delete pathObj.root;
        delete pathObj.base;
        let baseName = pathObj.name;

        let keys = Object.keys(this._blocks).map(key => Number(key));
        let files = {};
        for(let i=0;i<keys.length;i++) {
            let height = keys[i];
            pathObj.name = baseName + BLOCKS_FILE_DELIMITER + (height - ((height-1)%BLOCKS_IN_FILE));
            let file = path.format(pathObj);
            if(!files[file]) {
                files[file] = [];
            }
            files[file].push(this._blocks[height]);
        }
        let filesList = Object.keys(files);
        for(let i=0;i<filesList.length;i++) {
            let file = filesList[i];
            this._upsertBlocksInFile(file, files[file])
        }
        transactions.storage._saveUTXOs();
    }

    _upsertBlocksInFile(file, blocks) {
        if(!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(blocks, null, 2));
            return
        }
        let blocksFromFile = JSON.parse((fs.readFileSync(file)).toString());
        let startHeight = blocksFromFile[0].header.height;
        for(let i=0;i<blocks.length;i++) {
            let block = blocks[i];
            blocksFromFile[block.header.height - startHeight] = block;
        }
        fs.writeFileSync(file, JSON.stringify(blocks, null, 2));
    }
}

module.exports = new Storage();
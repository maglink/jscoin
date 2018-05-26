"use strict";

let fs = require("fs");
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

class Storage {
    constructor() {
        this._blocks = [];
        this._sideChains = [];
        this._onChangeLastBlockHandlers = [];
        this._loadBlocks();
        return this;
    }

    _loadBlocks() {
        if(!fs.existsSync(config.data.storage.blocks)) {
            this._blocks = [GENESIS_BLOCK];
            transactions.storage.commitTrxs(GENESIS_BLOCK.trxs);
            this._saveBlocks();
            return;
        }
        this._blocks = JSON.parse((fs.readFileSync(config.data.storage.blocks)).toString());
        this._executeChangeTopHandlers();
    }

    _saveBlocks() {
        fs.writeFileSync(config.data.storage.blocks, JSON.stringify(this._blocks, null, 2));
        transactions.storage._saveUTXOs();
    }

    getLastBlock() {
        return this._blocks[this._blocks.length-1];
    }

    getLastBlockHeader() {
        let lastBlock = this.getLastBlock();
        return {
            "hash": lastBlock.hash,
            "header": lastBlock.header,
        }
    }

    getBlocksHeight() {
        return this._blocks.length;
    }

    getBlocks(from, to) {
        if(!to || to - from > 10) {
            to = from + 10;
        }
        return this._blocks.slice(from-1, to-1);
    }

    getBlockByHeight(height) {
        return this._blocks[height-1];
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
        if(block.header.height <= this._blocks.length) {
            this._addBlockToSideChain(block);
        } else {
            let prevBlock = this.getBlockByHeight(block.header.height - 1);
            if(!prevBlock
                || prevBlock.header.height !== block.header.height - 1
                || block.header.hashPrevBlock !== prevBlock.hash){
                this._addBlockToSideChain(block);
            } else {
                this._blocks.push(block);
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

        if(prevBlock !== this._blocks[prevBlock.header.height - 1]) {
            throw new Error("Incorrect prev block position in main chain");
        }

        let newSideChain = this._blocks.slice(prevBlock.header.height, this._blocks.length);

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

        this._blocks = this._blocks.slice(0, prevBlock.header.height);
        this._blocks = this._blocks.concat(this._sideChains[chainNum].blocks);

        this._sideChains[chainNum].blocks = newSideChain;
        this._sideChains[chainNum].height = newSideChain[newSideChain.length-1].header.height;

        this._executeChangeTopHandlers();
        this._saveBlocks();
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
}

module.exports = new Storage();
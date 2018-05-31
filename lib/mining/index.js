"use strict";

let sha3_256 = require('js-sha3').sha3_256;
let config = require('../config');
let peers = require('../peers');
let blocks = require('../blocks');
let transactions = require('../transactions');
let Transaction = transactions.Transaction;
let SpeedCounter = require('./speedCounter');

class Miner {
    constructor() {
        let _self = this;

        _self.coinbaseAddress = transactions.getAddressFromPubKey(config.data.wallet.pubKey);

        _self.blockHeader = {
            version: 1,
            height: blocks.storage.getBlocksHeight() + 1,
            timestamp: Date.now(),
            hashPrevBlock: blocks.storage.getLastBlock().hash,
            hashMerkleRoot: "",
            difficulty: blocks.getNextDifficultyByBlock(blocks.storage.getLastBlock()),
            noonce: 0
        };

        _self.mineInterval = null;
        _self.timeUpdateInterval = null;
        _self.blockFoundHandlers = [];
        _self.speedCounter = new SpeedCounter();

        blocks.storage.onChangeLastBlock(() => {
            if(!_self.mineInterval) {
                return;
            }
            _self.updateLastBlock(blocks.storage.getLastBlock())
        });

        transactions.storage.onTransactionsAdded(() => {
            if(!_self.mineInterval) {
                return;
            }
            if(_self._blockIsFilled) {
               return;
            }
            _self.updateTrxs();
        });

        return this;
    }

    start() {
        let _self = this;

        this.updateLastBlock(blocks.storage.getLastBlock());

        _self.speedCounter.start();
        _self.mineInterval = setInterval(() => {
            _self._mine();
            _self.speedCounter.tick();
        }, 0);
        _self.timeUpdateInterval = setInterval(() => {
            _self.blockHeader.timestamp = Date.now();
            _self.blockHeader.noonce = 0;
        }, 1000);
        return _self;
    }

    stop() {
        let _self = this;
        if(_self.mineInterval) {
            clearInterval(_self.mineInterval);
            _self.mineInterval = null;
            _self.speedCounter.stop();
        }
        if(_self.timeUpdateInterval) {
            clearInterval(_self.timeUpdateInterval);
            _self.timeUpdateInterval = null;
        }
        return _self;
    }

    _mine() {
        let _self = this;
        _self.blockHeader.noonce++;
        let json = JSON.stringify(_self.blockHeader);
        let hash = sha3_256(sha3_256(json));
        if(blocks.getDifficultyFromHash(hash) >= _self.blockHeader.difficulty) {
            _self._blockFound(_self._getFullBlock(hash));
        }
    }

    _blockFound(block) {
        let _self = this;
        this.stop();

        console.log("block found", JSON.stringify(block, null, 2));
        blocks.addBlock(block);
        peers.newBlockFound();

        _self.blockFoundHandlers.forEach((handler) => {
            handler(block)
        });
        this.start();
    }

    _getFullBlock(hash) {
        let _self = this;
        return {
            hash: hash,
            header: {
                version: _self.blockHeader.version,
                height: _self.blockHeader.height,
                timestamp: _self.blockHeader.timestamp,
                hashPrevBlock: _self.blockHeader.hashPrevBlock,
                hashMerkleRoot: _self.blockHeader.hashMerkleRoot,
                difficulty: _self.blockHeader.difficulty,
                noonce: _self.blockHeader.noonce,
            },
            trxs: JSON.parse(JSON.stringify(_self.trxs))
        }
    }

    onBlockFound(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");
        }
        this.blockFoundHandlers.push(handler);
        return this;
    }

    updateLastBlock(block) {
        let _self = this;

        _self.blockHeader.height = block.header.height + 1;
        _self.blockHeader.hashPrevBlock = block.hash;
        _self.blockHeader.difficulty = blocks.getNextDifficultyByBlock(block);

        _self.updateTrxs();
    }

    updateTrxs() {
        let _self = this;

        _self.trxs = [];
        let blockLengthSum = 256; //gup for number changes

        let blockHash = sha3_256(sha3_256(JSON.stringify(_self.blockHeader)));
        let fullBlock = _self._getFullBlock(blockHash);
        blockLengthSum += JSON.stringify(fullBlock).length;

        let coinbase = new Transaction(null, _self.coinbaseAddress,
            blocks.getRewardByHeight(_self.blockHeader.height));
        let coinbaseTrx = coinbase.getData();
        _self.trxs.push(coinbaseTrx);
        blockLengthSum += JSON.stringify(coinbaseTrx).length;


        transactions.storage.cleanUpUnconfirmedTrxs();

        let offset = 0;
        _self._blockIsFilled = false;
        loop1:
        while(1) {
            let trxs = transactions.storage.getUnconfirmedTrxs(offset);
            if(!trxs.length) {
                break;
            }
            offset += trxs.length;
            for(let i=0;i<trxs.length;i++) {
                let trx = trxs[i];

                blockLengthSum += (JSON.stringify(trx).length + 1/*comma*/);
                if(blockLengthSum > blocks.getBlockMaxLen()) {
                    _self._blockIsFilled = true;
                    break loop1;
                }

                coinbase._data.body.fees += trx.body.fee;
                _self.trxs.push(trx);
            }
        }

        _self.blockHeader.hashMerkleRoot = blocks.getMerkleTreeRoot(_self.trxs);
        _self.blockHeader.timestamp = Date.now();
        _self.blockHeader.noonce = 0;
    }
}

module.exports.Miner = Miner;
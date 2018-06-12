"use strict";

let nacl = require('tweetnacl');
let sha3_256 = require('js-sha3').sha3_256;
let crypto = require('crypto');
let Base58 = require("base-58");
let storage = require('./storage');
let config = require('../config');
let blocks = require('../blocks');

const TRX_MIN_AMOUNT = 1000000; //temp
const TRX_FEE_RATE = 0.002;
const TRX_MAX_LENGTH = 256;
const TRX_SIGN_LEN = 193;
const ADDRESS_PREFIX = "810c44"; // - "JSc1"

class Transaction {
    constructor(from, to, amount, message) {
        this._data = Transaction._createTrx(from, to, amount, message, Date.now());
        return this;
    }

    getData() {
        return this._data;
    }

    static fromData(data) {
        if(typeof data !== 'object') {
            throw new Error("Trx is not an object");
        }
        if(typeof data.body !== 'object') {
            throw new Error("Trx body is not an object");
        }

        let trx = new Transaction(null, data.body.to, data.body.amount);
        trx._data = Transaction._createTrx(data.body.from, data.body.to,
            data.body.amount, data.body.message, data.body.timestamp);

        if(typeof data.hash !== 'string' || !data.hash.length) {
            throw new Error("Invalid 'hash' field");
        }
        if(trx._data.hash !== data.hash) {
            throw new Error("Trx hash is invalid");
        }
        if(trx._data.body.fee && trx._data.body.fee !== data.body.fee) {
            throw new Error("Invalid 'fee' field");
        }
        if(trx.isCoinbase()) {
            if(!Number.isSafeInteger(data.body.fees) || data.body.fees < 0) {
                throw new Error("Invalid 'fees' field");
            }
            trx._data.body.fees = data.body.fees;
        }

        if(typeof data.sign === 'string' && data.sign.length) {
            if(data.sign.length !== TRX_SIGN_LEN) {
                throw new Error("Invalid 'sign' field");
            }
            trx._data.sign = data.sign;
        }

        return trx;
    }

    static _createTrx(from, to, amount, message, timestamp) {
        try {
            module.exports.validateAddress(to);
        } catch (e) {
            e.message = "Invalid 'to' field: " + e.message;
            throw e;
        }

        if(typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error("Invalid 'amount' field");
        }

        if(typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > Date.now()) {
            throw new Error("Invalid 'timestamp' field");
        }

        if(amount < TRX_MIN_AMOUNT) {
            throw new Error("The amount is less than min");
        }

        let data = {hash: "", body: {}};

        if(typeof from === 'string' && from.length) {
            try {
                module.exports.validateAddress(from);
            } catch (e) {
                e.message = "Invalid 'from' field: " + e.message;
                throw e;
            }
            data.body.from = from;
        }

        data.body.to = to;
        data.body.amount = amount;

        if(data.body.from) {
            data.body.fee = Math.floor(data.body.amount * TRX_FEE_RATE);
        } else {
            data.body.fees = 0;
        }

        if(typeof message === 'string' && message.length) {
            data.body.message = message;
        }

        data.body.timestamp = timestamp;

        let bodyString = JSON.stringify(data.body);
        if(bodyString.length > TRX_MAX_LENGTH) {
            throw new Error("Transaction body length is gt than max");
        }

        data.hash = sha3_256(bodyString);

        return data;
    }

    sign(publicKey, secretKey) {
        let secKey = new Uint8Array(Buffer.from(secretKey, "hex"));
        let hash = new Uint8Array(Buffer.from(this._data.hash, "hex"));
        let sign = nacl.sign.detached(hash, secKey);
        this._data.sign = publicKey + " " + Buffer.from(sign).toString('hex');
        return this;
    }

    verifySign() {
        if(this.isCoinbase()) {
            return true;
        }
        if(!this._data.sign) {
            return false;
        }
        let publicKeyHex = this._data.sign.split(" ")[0];
        let hash = new Uint8Array(Buffer.from(this._data.hash, "hex"));
        let publicKey = new Uint8Array(Buffer.from(publicKeyHex, "hex"));
        let sign = new Uint8Array(Buffer.from(this._data.sign.split(" ")[1], "hex"));

        let address = module.exports.getAddressFromPubKey(publicKeyHex);
        if(this._data.body.from !== address) {
            return false;
        }

        return nacl.sign.detached.verify(hash, sign, publicKey);
    }

    isCoinbase() {
        return (typeof this._data.body.from === 'undefined');
    }
}

module.exports.Transaction = Transaction;
module.exports.storage = storage;

module.exports.validateBlockTrxs = function(block) {
    let feeSum = 0;
    for(let i=0;i<block.trxs.length;i++) {
        let trxData = block.trxs[i];

        let trx;
        try {
            trx = Transaction.fromData(trxData);
        } catch (e) {
            e.message = "Validate trx: " + e.message;
            throw e;
        }

        if(i===0 && !trx.isCoinbase()) {
            throw new Error("First trx in block is not coinbase");
        }
        if(i!==0 && trx.isCoinbase()) {
            throw new Error("Too much coinbase trxs in block");
        }

        if(!trx.verifySign()) {
            throw new Error("Trx signature not verified");
        }

        if(trxData.body.timestamp > block.header.timestamp) {
            throw new Error("Trx time is gt than block time");
        }

        if(i!==0) {
            feeSum += trxData.body.fee;
        }
    }

    let coinbase = block.trxs[0];
    if(coinbase.body.fees !== feeSum) {
        throw new Error("Invalid fees sum");
    }
};

module.exports.createAndSendTransaction = function(to, amount, message, keyword) {
    let trx = new Transaction(
        module.exports.getAddressFromPubKey(config.data.wallet.pubKey),
        to, amount, message)
        .sign(config.data.wallet.pubKey, config.data.wallet.secKey);
    storage.addTransaction(trx);
    return trx.getData();
};

module.exports.getAddressFromPubKey = function(publicKeyHex) {
    let publicKey = new Uint8Array(Buffer.from(publicKeyHex, "hex"));
    let hash256 = crypto.createHash('SHA256').update(publicKey).digest();
    let hashRMD160 = crypto.createHash('RIPEMD160').update(hash256).digest();
    let hashWithPrefix = Buffer.concat([Buffer.from(ADDRESS_PREFIX, "hex"), hashRMD160]);
    let hash256x2_1 = crypto.createHash('SHA256').update(hashWithPrefix).digest();
    let hash256x2_2 = crypto.createHash('SHA256').update(hash256x2_1).digest();
    let resultHash = Buffer.concat([hashWithPrefix, hash256x2_2.slice(0, 4)]);
    return Base58.encode(resultHash);
};

module.exports.validateAddress = function(address) {
    let addressBinary = Base58.decode(address);
    let prefixBinary = Buffer.from(ADDRESS_PREFIX, "hex");

    if(addressBinary.length !== 24 + prefixBinary.length) {
        throw new Error("Address length is invalid");
    }

    if(!Buffer.from(addressBinary.slice(0, 3)).equals(prefixBinary)) {
        throw new Error("Address prefix is invalid");
    }

    let addressCheckSum = addressBinary.slice(-4);
    let hashWithPrefix = addressBinary.slice(0, -4);
    let hash256x2_1 = crypto.createHash('SHA256').update(hashWithPrefix).digest();
    let hash256x2_2 = crypto.createHash('SHA256').update(hash256x2_1).digest();

    if(!Buffer.from(hash256x2_2.slice(0, 4)).equals(addressCheckSum)) {
        throw new Error("Address checksum failed");
    }
};

module.exports.getTrxsListByAddress = function(address, limit, offset) {
    return storage._getTrxsWatchingByAddress(address, limit, offset);
};

module.exports.getTrxInfoByHash = function(hash) {
    let info = storage.getUnconfirmedTrxInfoByHash(hash);
    if (info) {
        return info;
    }

    info = storage.getTrxInfoByHash(hash);
    if (!info) {
        return null
    }

    info.block = blocks.storage.getBlockByHeight(info.height);

    info.block.trxs.forEach((trx) => {
        if(trx.hash === hash) {
            info.data = trx
        }
    });

    return info;
};
"use strict";

let fs = require("fs");
let path = require('path');
let nacl = require('tweetnacl');

class Config {
    constructor() {}

    load(mainPath, filepath) {
        this.mainPath = mainPath;
        this.configFilePath = path.join(mainPath, filepath);

        if(!fs.existsSync(this.configFilePath)) {
            this._ensureDirectoryExistence(this.configFilePath);
            fs.writeFileSync(this.configFilePath, "{}");
        }
        let content = fs.readFileSync(this.configFilePath);
        this._data = JSON.parse(content);


        if(!this.data.wallet) {

            let pair = nacl.sign.keyPair();
            let pubKey = Buffer.from(pair.publicKey).toString('hex');
            let secKey = Buffer.from(pair.secretKey).toString('hex');

            this.data.wallet = {
                "pubKey": pubKey,
                "secKey": secKey
            }

        }

        if(!this.data.address) {
            this.data.address = "127.0.0.1:6730"
        }

        if(!this.data.nodes) {
            this.data.nodes = []
        }

        if(!this.data.storage) {
            this.data.storage = {}
        }
        if(!this.data.storage.file) {
            this.data.storage.file = path.join(mainPath, "data/data.db")
        }

        this.save();
    }

    save() {
        let content = JSON.stringify(this._data, null, 2);
        fs.writeFileSync(this.configFilePath, content);
    }

    get data() {
        return this._data;
    }

    set data(newData) {
        this._data = newData;
    }

    _ensureDirectoryExistence(filePath) {
        let dirname = path.dirname(filePath);
        if (fs.existsSync(dirname)) {
            return true;
        }
        this._ensureDirectoryExistence(dirname);
        fs.mkdirSync(dirname);
    }
}

module.exports = new Config();
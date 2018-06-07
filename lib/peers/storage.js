"use strict";

let db = require("../database");

class Storage {
    constructor() {
        db.prepare(`CREATE TABLE IF NOT EXISTS peers (
            address VARCHAR(50) PRIMARY KEY,
            last_connection UNSIGNED INTEGER,
            error VARCHAR(255)
        );`).run();

        return this;
    }

    savePeer(address, isConnected, err) {
        let errorString = null;
        if(err) {
            errorString = err.message.substring(0, 255);
        }

        let lastConnection = null;
        if(isConnected) {
            lastConnection = Date.now();

            db.prepare(`UPDATE peers 
            SET last_connection = ?, error = ?
            WHERE address = ?`).run(address, lastConnection, errorString);
        } else {

            db.prepare(`INSERT OR IGNORE INTO peers(address, last_connection, error)
            VALUES(?, ?, ?);`).run(address, lastConnection, errorString);
        }
    }

    getRandomPeers(limit) {
        limit = limit || 10;

        let result = db.prepare(`
            SELECT address FROM peers 
            ORDER BY 
                CASE WHEN error IS NULL THEN 0 ELSE 1 END, 
                RANDOM()
            LIMIT ?`).all(limit);

        return result.map(item => item.address);
    }
}

module.exports = new Storage();
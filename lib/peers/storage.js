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

            let item = db.prepare(`SELECT * FROM peers WHERE address = ?`).get(address);
            if(item) {
                db.prepare(`UPDATE peers 
                SET last_connection = ?, error = ?
                WHERE address = ?`).run(lastConnection, errorString, address);
            } else {
                db.prepare(`INSERT OR IGNORE INTO peers(address, last_connection, error)
                    VALUES(?, ?, ?);`).run(address, lastConnection, errorString);
            }
        } else {
            db.prepare(`INSERT OR IGNORE INTO peers(address, last_connection, error)
            VALUES(?, ?, ?);`).run(address, lastConnection, errorString);
        }
    }

    deletePeer(address) {
        db.prepare(`DELETE FROM peers WHERE address = ?`).run(address);
    }

    getRandomPeers(limit, forPropagate) {
        limit = limit || 10;

        let propagateAddition = ``;
        if(forPropagate) {
            propagateAddition = `
                CASE WHEN last_connection IS NULL THEN 1 ELSE 0 END,
                CASE WHEN error IS NULL THEN 0 ELSE 1 END,`
        }

        let result = db.prepare(`
            SELECT address FROM peers 
            ORDER BY 
                ${propagateAddition} 
                RANDOM()
            LIMIT ?`).all(limit);

        return result.map(item => item.address);
    }
}

module.exports = new Storage();
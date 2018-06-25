"use strict";

let Database = require('better-sqlite3');
let fs = require('fs');
let debug = require('../debug');

module.exports = function(file) {
    let db = new Database(file);
    db.exec(`PRAGMA auto_vacuum = FULL;`);
    commitMigrations(db);
    module.exports = db;
    return db;
};

function commitMigrations(db) {
    db.prepare(`CREATE TABLE IF NOT EXISTS migrations (
        number UNSIGNED INTEGER PRIMARY KEY
    );`).run();

    let lastCommited = db.prepare(`SELECT MAX(number) as number FROM migrations`).get();
    let nowCommitingNumber = lastCommited ? lastCommited.number + 1 : 1;

    while(1) {
        let path = `./migrations/migration${nowCommitingNumber}.js`;
        if (!fs.existsSync(__dirname + "/" + path)) {
            break;
        }
        let migration = require(path);
        migration(db);
        db.prepare(`INSERT INTO migrations (number) VALUES (?);`).run(nowCommitingNumber);
        debug.log(`Migration ${path} is applied`);
        nowCommitingNumber++;
    }
}
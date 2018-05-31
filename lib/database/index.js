"use strict";

let Database = require('better-sqlite3');

module.exports = function(file) {
    let db = new Database(file);
    db.exec(`PRAGMA auto_vacuum = FULL;`);
    module.exports = db;
    return db;
};
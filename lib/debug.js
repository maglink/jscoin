'use strict';

module.exports.enabled = false;

module.exports.log = function(...args) {
    if(module.exports.enabled) {
        console.log(...args)
    }
};
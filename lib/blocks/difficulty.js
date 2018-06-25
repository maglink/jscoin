"use strict";

let bigInt = require("big-integer");
let main = require("./index");

const MIN_TARGET = "05ffffff";

module.exports.getMinTarget = function() {
    return MIN_TARGET;
};

module.exports.encode = function(fullTarget) {
    if(fullTarget.length !== 64) {
        throw new Error(`Full target has ${fullTarget.length} chars`);
    }
    let prefixCount = 0;
    let precision = "";
    for(let i=0;i<64;i++) {
        if(precision === "" && fullTarget[i] === "0") {
            prefixCount++;
        } else {
            precision += fullTarget[i];
        }
        if(precision.length >= 6) {
            break;
        }
    }
    let target = prefixCount.toString(16);
    for(let i=target.length;i<2;i++) {
        target = "0" + target;
    }
    target += precision;
    return target;
};

module.exports.decode = function(target) {
    if(target.length !== 8) {
        throw new Error(`The target has ${target.length} chars`);
    }
    let fullTarget = "";
    let prefix = target.substr(0, 2);
    let prefixCount = parseInt(prefix, 16);
    for(let i=0;i<prefixCount;i++) {
        fullTarget += "0";
    }
    fullTarget += target.substr(2, 6);
    for(let i=fullTarget.length;i<64;i++) {
        fullTarget += "0";
    }
    return fullTarget;
};

module.exports.getDifficultyFromTarget = function(target) {
    let targetNum = bigInt(this.decode(target), 16).toJSNumber();
    let minTargetNum = bigInt(this.decode(MIN_TARGET), 16).toJSNumber();
    return minTargetNum/targetNum;
};

module.exports.getTargetFromDifficulty = function(difficulty) {
    let minTargetNum = bigInt(this.decode(MIN_TARGET), 16);
    let targetNum = bigInt(Math.floor(minTargetNum.toJSNumber()/difficulty));
    if(targetNum.compare(minTargetNum) === 1) {
        targetNum = minTargetNum;
    }
    let targetFull = targetNum.toString(16);
    for(let i=targetFull.length;i<64;i++) {
        targetFull = "0" + targetFull;
    }
    return this.encode(targetFull);
};

module.exports.checkHashByTarget = function(hash, target) {
    if(hash.substr(0, 5) !== "00000") {
        return false;
    }
    hash = hash.replace(/^0+/, '');
    let fullTarget = this.decode(target).replace(/^0+/, '');
    if(fullTarget.length < hash.length) {
        return false;
    }
    if(hash.length < fullTarget.length) {
        return true;
    }
    let targetNum = bigInt(fullTarget, 16);
    let hashNum = bigInt(hash, 16);
    return targetNum.compare(hashNum) === 1;
};

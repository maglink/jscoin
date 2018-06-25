'use strict';

let expect = require('chai').expect;
let jsCoin = require("../lib");

jsCoin.init(__dirname + "/../", "data/config.json", true);

after(function() {
    setTimeout(process.exit, 0);
});

describe('blocks', function () {
    describe('getRewardByHeight()', function () {
        it('max coins count', function () {
            let maxSum = 2100000100000000;
            let minSum = 2100000000000000;
            let sum = 0;

            for(let i=1;i<11*365*144;i++) {
                sum += jsCoin.blocks.getRewardByHeight(i);
            }

            expect(sum).to.be.at.least(minSum);
            expect(sum).to.be.below(maxSum);
        })
    })
});

describe('blocks.difficulty', function () {

    describe('encode()', function () {
        it('test 1', function () {
            let fullTarget = "000000000000000000376f560000000000000000000000000000000000000000";
            let target = "12376f56";
            let result = jsCoin.blocks.difficulty.encode(fullTarget);
            expect(result).to.be.equal(target);
        });
    });

    describe('decode()', function () {
        it('test 1', function () {
            let fullTarget = "000000000000000000376f560000000000000000000000000000000000000000";
            let target = "12376f56";
            let result = jsCoin.blocks.difficulty.decode(target);
            expect(result).to.be.equal(fullTarget);
        });
    });

    describe('getDifficultyFromTarget()', function () {
        it('test 1', function () {
            let target = "09fff000";
            let difficulty = 65552;
            let result = jsCoin.blocks.difficulty.getDifficultyFromTarget(target);
            expect(result).to.be.equal(difficulty);
        });
    });

    describe('getTargetFromDifficulty()', function () {
        it('test 1', function () {
            let target = "056f4de9";
            let difficulty = 2.3;
            let result = jsCoin.blocks.difficulty.getTargetFromDifficulty(difficulty);
            expect(result).to.be.equal(target);
        });
    });

    describe('checkHashByTarget()', function () {
        it('test 1', function () {
            let hash = "00001a8ad6d494559f3eba9487e7841ae42554c7ab47f8fa238e353a629ac430";
            let target = "056f4de9";
            let result = jsCoin.blocks.difficulty.checkHashByTarget(hash, target);
            expect(result).to.be.equal(false);
        });
        it('test 2', function () {
            let hash = "0000008ad6d494559f3eba9487e7841ae42554c7ab47f8fa238e353a629ac430";
            let target = "056f4de9";
            let result = jsCoin.blocks.difficulty.checkHashByTarget(hash, target);
            expect(result).to.be.equal(true);
        });
    });
});
"use strict";

class SpeedCounter {
    constructor(printPeriod, printHandler) {
        if(!printPeriod) {
            printPeriod = 5000
        }
        if(!printHandler) {
            printHandler = (speed) => {
                console.log(speed);
            }
        }

        let _self = this;
        _self.count = 0;
        _self.printPeriod = printPeriod;
        _self.printHandler = printHandler;
    }

    start() {
        let _self = this;
        _self.count = 0;
        if(_self.printInterval) {
            clearInterval(_self.printInterval);
        }
        _self.printInterval = setInterval(() => {
            let speed = Math.floor(_self.count/(_self.printPeriod/1000));
            _self.printHandler(speed);
            _self.count = 0;
        }, _self.printPeriod);
    }

    tick() {
        this.count++;
    }

    stop() {
        let _self = this;
        if(_self.printInterval) {
            clearInterval(_self.printInterval);
        }
    }

    setPrintHandler(handler) {
        if(typeof handler !== 'function') {
            throw new Error("Handler is not a function");
        }
        this.printHandler = handler;
    }
}

module.exports = SpeedCounter;
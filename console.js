let jsCoin = require("./lib");

let argv = require('optimist')
    .usage('Usage: $0 -c [config]')
    .alias('c', 'config')
    .describe('c', 'config path')
    .default('c', "data/config.json")
    .argv;

jsCoin.init(__dirname, argv.config);

let address = jsCoin.transactions.getAddressFromPubKey(jsCoin.config.data.wallet.pubKey);
console.log("Wallet address: ", address);

//jsCoin.miner.start();
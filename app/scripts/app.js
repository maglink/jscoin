const {remote} = require('electron');

let jsCoin = remote.getGlobal('jsCoin');
console.log(jsCoin);

require('devtron').install();

angular.module('jscApp', [])
    .controller('MainCtrl', function($scope) {

        $scope.publicKey = jsCoin.config.data.wallet.pubKey;
        $scope.address = jsCoin.transactions.getAddressFromPubKey($scope.publicKey);
        updateBalance();
        updateNetwork();
        updateTrxsList();

        let miner = jsCoin.miner;

        $scope.mineSpeed = 0;
        miner.speedCounter.setPrintHandler((speed) => {
            $scope.mineSpeed = speed + " h/s";
            setTimeout(() => $scope.$apply(), 0);
        });

        $scope.mineStart = () => {
            $scope.mineSpeed = "calculating...";
            miner.start();
        };

        $scope.mineStop = () => {
            miner.stop();
            $scope.mineSpeed = 0;
        };

        jsCoin.blocks.storage.onChangeLastBlock(() => {
            updateNetwork();
            updateBalance();
            updateTrxsList();
            setTimeout(() => $scope.$apply(), 0);
        });


        jsCoin.transactions.storage.onTransactionsAdded(() => {
            updateBalance();
            updateTrxsList();
            setTimeout(() => $scope.$apply(), 0);
        });

        function updateBalance() {
            $scope.balance = jsCoin.transactions.storage._getAddressValue($scope.address);
            $scope.balance = ($scope.balance/100000000).toFixed(8);
        }

        function updateNetwork() {
            $scope.lastBlock = jsCoin.blocks.storage.getLastBlockHeader();
            $scope.networkDifficulty = $scope.lastBlock.header.difficulty;

            //please let me know how calculate it properly
            $scope.networkHashrate = Math.pow(16, ($scope.networkDifficulty/16))/600;
        }

        function updateTrxsList() {
            $scope.trxs = jsCoin.transactions.getTrxsListByAddress($scope.address);
            console.log($scope.trxs.length)
        }

        $scope.newTrx = {};
        $scope.createTransaction = function(form) {
            if (form) {
                form.$setPristine();
                form.$setUntouched();
            }

            let amount = Math.floor($scope.newTrx.amount*100000000);

            jsCoin.transactions.createAndSendTransaction($scope.newTrx.address,
                amount, $scope.newTrx.message, "");

            $scope.newTrx = {};
        };

    });
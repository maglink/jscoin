AppControllers.controller('WalletCtrl', function ($scope, $rootScope, jsCoin, $location) {

    $rootScope.changeNavItem('wallet');

    let publicKey = jsCoin.config.data.wallet.pubKey;
    $scope.address = jsCoin.transactions.getAddressFromPubKey(publicKey);

    function updateBalance() {
        let satishiInCoin = 100000000;
        let satoshiBalance = jsCoin.transactions.storage.getAddressBalance($scope.address);
        //satoshiBalance = 145.0 * satishiInCoin;

        $scope.balanceCoins = Math.floor(satoshiBalance / satishiInCoin);
        $scope.balanceSatoshi = ("" + (satoshiBalance % satishiInCoin / satishiInCoin).toFixed(8)).substr(2)
    }
    updateBalance();

    function updateTrxsList() {
        $scope.trxs = jsCoin.transactions.getTrxsListByAddress($scope.address, 10, 0);
    }
    updateTrxsList();

    let onChangeLastBlock = () => {
        updateBalance();
        updateTrxsList();
        setTimeout(() => $scope.$apply(), 0);
    };
    let onTransactionsAdded = () => {
        updateBalance();
        updateTrxsList();
        setTimeout(() => $scope.$apply(), 0);
    };

    jsCoin.blocks.storage.onChangeLastBlock(onChangeLastBlock);
    jsCoin.transactions.storage.onTransactionsAdded(onTransactionsAdded);

    $scope.$on('$destroy', function() {
        jsCoin.blocks.storage.removeOnChangeLastBlock(onChangeLastBlock);
        jsCoin.transactions.storage.removeOnTransactionsAdded(onTransactionsAdded);
    });

    let maxTrxsCount = null;
    $scope.infiniteItems = {

        getItemAtIndex: function(index) {
            if (index >= $scope.trxs.length) {
                let moreTrxs = jsCoin.transactions.getTrxsListByAddress($scope.address, 10, $scope.trxs.length);
                if(!moreTrxs.length || moreTrxs.length < 10) {
                    maxTrxsCount = $scope.trxs.length;
                }
                $scope.trxs = $scope.trxs.concat(moreTrxs);
            }
            return $scope.trxs[index];
        },

        getLength: function() {
            if(maxTrxsCount && maxTrxsCount === $scope.trxs.length) {
                return maxTrxsCount;
            }
            if($scope.trxs.length < 10) {
                return $scope.trxs.length;
            }
            return $scope.trxs.length + 10;
        },

    };

    $scope.openTransaction = function(hash) {
        $location.url("/transaction/"+hash)
    }

});
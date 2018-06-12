AppControllers.controller('SendCtrl', function ($scope, $rootScope, jsCoin, $mdToast) {

    let publicKey = jsCoin.config.data.wallet.pubKey;
    $scope.address = jsCoin.transactions.getAddressFromPubKey(publicKey);

    function updateBalance() {
        let satishiInCoin = 100000000;
        let satoshiBalance = jsCoin.transactions.storage.getAddressBalance($scope.address);
        $scope.balance = (satoshiBalance / satishiInCoin).toFixed(8)
    }
    updateBalance();

    if (!$rootScope.newTrx) {
        $rootScope.newTrx = {}
    }
    $scope.newTrx = $rootScope.newTrx;

    $scope.maxMessageLenCalc = function () {
        let amount = Math.floor($scope.newTrx.amount * 100000000);
        let body = {
            from: $scope.address,
            to: $scope.newTrx.address || "",
            amount: amount,
            fee: amount * 0.002,
            message: ""
        };
        let bodyString = JSON.stringify(body);
        $scope.maxMessageLen = 256 - bodyString.length;
        return ($scope.newTrx.message || "").length > $scope.maxMessageLen;
    };
    $scope.maxMessageLenCalc();

    let showErrToast = function(e) {
        $mdToast.show(
            $mdToast.simple()
                .textContent(e.message)
                .position("top right")
                .hideDelay(3000)
        );
    };

    $scope.createTransaction = function (form) {
        if ($scope.maxMessageLenCalc()) {
            form.message.$error.maxlength = true;
            return;
        } else {
            delete form.message.$error.maxlength;
        }

        try {
            let amount = Math.floor($scope.newTrx.amount * 100000000);
            let trx = jsCoin.transactions.createAndSendTransaction($scope.newTrx.address,
                amount, $scope.newTrx.message, "");
            $rootScope.toastHash = trx.hash;
            $mdToast.show($mdToast.transactionToast());
        } catch (e) {
            console.log(e);
            showErrToast(e);
            return;
        }

        if (form) {
            form.$setPristine();
            form.$setUntouched();
        }
        $rootScope.newTrx = {};
        $scope.newTrx = $rootScope.newTrx;
    };

    $scope.validateAddress = function (address, errs) {
        try {
            jsCoin.transactions.validateAddress(address);
            delete errs["validate"];
            $scope.maxMessageLenCalc();
        } catch (e) {
            errs["validate"] = true;
        }
    };

    $scope.getMaxAmount = function () {
        $scope.maxMessageLenCalc();
        return ($scope.balance / 1.002).toFixed(8);
    };

    $scope.setMaxAmount = function () {
        $scope.newTrx.amount = Number.parseFloat($scope.getMaxAmount());
    };

    $scope.formIsErrored = function (form) {
        if (Object.keys(form.address.$error).length) {
            return true
        }
        if (Object.keys(form.amount.$error).length) {
            return true
        }
        if(($scope.newTrx.message || "").length > $scope.maxMessageLen) {
            return true
        }
        return false
    };

    let onChangeLastBlock = () => {
        updateBalance();
        setTimeout(() => $scope.$apply(), 0);
    };
    let onTransactionsAdded = () => {
        updateBalance();
        setTimeout(() => $scope.$apply(), 0);
    };

    jsCoin.blocks.storage.onChangeLastBlock(onChangeLastBlock);
    jsCoin.transactions.storage.onTransactionsAdded(onTransactionsAdded);

    $scope.$on('$destroy', function() {
        jsCoin.blocks.storage.removeOnChangeLastBlock(onChangeLastBlock);
        jsCoin.transactions.storage.removeOnTransactionsAdded(onTransactionsAdded);
    });
});
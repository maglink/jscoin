AppControllers.controller('TransactionCtrl', function ($scope, $rootScope, jsCoin, $routeParams, $interval) {
    $scope.hash = $routeParams.hash;

    let updateInfo = function() {
        $scope.info = jsCoin.transactions.getTrxInfoByHash($routeParams.hash);
        $scope.lastHeight = jsCoin.blocks.storage.getBlocksHeight();
    };

    updateInfo();

    let interval = $interval(function() {
        updateInfo();
    }, 1000);

    $scope.$on('$destroy', function() {
        $interval.cancel(interval);
    });
});
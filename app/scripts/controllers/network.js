AppControllers.controller('NetworkCtrl', function ($scope, $rootScope, jsCoin) {
    let miner = jsCoin.miner;

    $rootScope.mineSpeed = $rootScope.mineSpeed || 0;
    miner.speedCounter.setPrintHandler((speed) => {
        $rootScope.mineSpeed = speed + " h/s";
        setTimeout(() => $scope.$apply(), 0);
    });

    $scope.mineStart = () => {
        $rootScope.mineSpeed = "calculating...";
        miner.start();
    };

    $scope.mineStop = () => {
        miner.stop();
        $rootScope.mineSpeed = 0;
    };

    function updateNetwork() {
        $scope.lastBlock = jsCoin.blocks.storage.getLastBlockHeader();
        $scope.networkDifficulty = $scope.lastBlock.header.difficulty;

        //please let me know how calculate it properly
        $scope.networkHashrate = Math.pow(16, ($scope.networkDifficulty / 16)) / 600;
    }
    updateNetwork();

    jsCoin.blocks.storage.onChangeLastBlock(() => {
        updateNetwork();
        setTimeout(() => $scope.$apply(), 0);
    });

});



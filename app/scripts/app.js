let App = angular.module('App', [
    'ng',
    'ngRoute',
    'AppControllers',
    'ngMaterial'
]);

let AppControllers = angular.module('AppControllers', []);

App.config(function($mdThemingProvider) {
    $mdThemingProvider.theme('default')
        .primaryPalette('blue')
        .accentPalette('blue');
});

App.config(['$locationProvider',
    function ($locationProvider) {
        $locationProvider.html5Mode({
            enabled: true
        });
    }]);

App.run(function ($rootScope) {
    $rootScope.$on( "$routeChangeStart", function() {
        $rootScope.changeNavItem('');
    });
});

App.config(['$routeProvider',
    function ($routeProvider) {
        $routeProvider
            .when('/wallet', {
                templateUrl: 'views/wallet.html',
                controller: 'WalletCtrl',
                reloadOnSearch: false
            })
            .when('/send', {
                templateUrl: 'views/send.html',
                controller: 'SendCtrl',
                reloadOnSearch: false
            })
            .when('/network', {
                templateUrl: 'views/network.html',
                controller: 'NetworkCtrl',
                reloadOnSearch: false
            })
            .when('/transaction/:hash', {
                templateUrl: 'views/transaction.html',
                controller: 'TransactionCtrl',
                reloadOnSearch: false
            })
            .otherwise({redirectTo: '/wallet'});
    }]);

const {remote} = require('electron');
let jsCoin = remote.getGlobal('jsCoin');

App.factory('jsCoin', function () {
    return jsCoin;
});

App.controller('SendToastCtrl', function($scope, $mdToast, $location) {
    let closed = false;

    $scope.showDetails = function(hash) {
        $scope.closeToast();
        $location.url("/transaction/"+hash)
    };

    $scope.closeToast = function() {
        if(closed){
            return;
        }
        closed = true;
        $mdToast.hide();
    };
});

App.config(function ($mdToastProvider) {
    $mdToastProvider.addPreset('transactionToast', {
        options: function() {
            return {
                hideDelay: 3000,
                position: 'top right',
                controller: 'SendToastCtrl',
                template:  `
                <md-toast>
                  <span class="md-toast-text" flex>Transaction successfully created</span>
                  <md-button class="md-highlight" ng-click="showDetails(toastHash)">
                    Show details
                  </md-button>
                  <md-button ng-click="closeToast()">
                    Close
                  </md-button>
                </md-toast>
                `
            };
        }
    });
});

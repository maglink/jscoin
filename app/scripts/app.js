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
            .otherwise({redirectTo: '/wallet'});
    }]);

const {remote} = require('electron');
let jsCoin = remote.getGlobal('jsCoin');

App.factory('jsCoin', function () {
    return jsCoin;
});

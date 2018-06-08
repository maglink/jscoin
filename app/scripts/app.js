let App = angular.module('App', [
    'ng',
    'ngRoute',
    'AppControllers',
    'ngMaterial'
]);

let AppControllers = angular.module('AppControllers', []);

App.config(function($mdThemingProvider) {
    $mdThemingProvider.theme('default')
        .primaryPalette('teal')
        .accentPalette('red');
});

App.config(['$locationProvider',
    function ($locationProvider) {
        $locationProvider.html5Mode({
            enabled: true,
            requireBase: false
        });
    }]);


App.config(['$routeProvider',
    function ($routeProvider) {
        $routeProvider
            .when('/wallet', {
                templateUrl: 'views/wallet.html',
                controller: 'WalletCtrl',
                reloadOnSearch: false
            })
            .otherwise({redirectTo: '/wallet'});
    }]);


const {remote} = require('electron');
let jsCoin = remote.getGlobal('jsCoin');

App.factory('jsCoin', function () {
    return jsCoin;
});
AppControllers.controller('HeaderCtrl',
    function ($scope, $rootScope, $location) {

        $scope.arr = {};

        $rootScope.changeNavItem = function(navItem) {
            $scope.arr.navItem = navItem;
        };

        $rootScope.getNavItem = function() {
            return $scope.arr.navItem;
        };

        $scope.goto = function(val) {
            if($location.path() !== val) {
                $location.url(val);
            }
        }

    });
/// <reference path="../typings/index.d.ts" />

import "ng-repeat-n";

angular.module("ng-rating-directive", ["ng-repeat-n-directive"])
    .directive('ngRating', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
        return {
            restrict: 'E',
            template: `<div class="ng-rating-container">
                           <span class="ng-rating-item" ng-repeat-n="5" ng-click="changeRating($index)">
                               <i class="full fa fa-star" ng-show="($index + 1) <= bindRating"></i>
                               <i class="half fa fa-star-half" ng-show="($index + 0.5) == bindRating"></i>
                               <i class="empty fa fa-star-o" ng-show="$index >= bindRating"></i>
                           </span>
                       </div>`,
            link: function ($scope, $element, $attributes, controller) {
                var getter = $parse($attributes.ngModel);
                var setter = getter.assign;
                $scope.$watch($attributes.ngModel, function () {
                    $scope.bindRating = getter($scope) || 0;
                });

                $scope.changeRating = function ($index) {
                    if (($index + 1) != $scope.bindRating) {
                        $scope.bindRating = $index + 1;
                    }
                    else {
                        $scope.bindRating = $index + 0.5;
                    }
                    setter($scope, $scope.bindRating);
                };
            }
        };
    }]);

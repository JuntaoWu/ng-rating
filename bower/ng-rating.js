(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
function createMap() {
    return Object.create(null);
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createMap;

},{}],2:[function(require,module,exports){
"use strict";
var uid = 0;
function nextUid() {
    return ++uid;
}
function hashKey(obj, nextUidFn) {
    var key = obj && obj.$$hashKey;
    if (key) {
        if (typeof key === 'function') {
            key = obj.$$hashKey();
        }
        return key;
    }
    var objType = typeof obj;
    if (objType == 'function' || (objType == 'object' && obj !== null)) {
        key = obj.$$hashKey = objType + ':' + (nextUidFn || nextUid)();
    }
    else {
        key = objType + ':' + obj;
    }
    return key;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = hashKey;

},{}],3:[function(require,module,exports){
/// <reference path="../typings/index.d.ts" />
"use strict";
var minErr_1 = require("./minErr");
var hashKey_1 = require("./hashKey");
var createMap_1 = require("./createMap");
var utils_1 = require("./utils");
var isArrayLike = utils_1.default.isArrayLike;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var isArray = utils_1.default.isArray;
var isFunction = utils_1.default.isFuntion;
var isBlankObject = utils_1.default.isBlankObject;
var slice = [].slice;
var forEach = utils_1.default.forEach;
var getBlockNodes = utils_1.default.getBlockNodes;
angular.module('ng-repeat-n-directive', [])
    .directive('ngRepeatN', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
        var NG_REMOVED = '$$NG_REMOVED';
        var ngRepeatMinErr = minErr_1.default('ngRepeat');
        var updateScope = function (scope, index, valueIdentifier, value, keyIdentifier, key, arrayLength) {
            // TODO(perf): generate setters to shave off ~40ms or 1-1.5%
            scope[valueIdentifier] = value;
            if (keyIdentifier)
                scope[keyIdentifier] = key;
            scope.$index = index;
            scope.$first = (index === 0);
            scope.$last = (index === (arrayLength - 1));
            scope.$middle = !(scope.$first || scope.$last);
            // jshint bitwise: false
            scope.$odd = !(scope.$even = (index & 1) === 0);
            // jshint bitwise: true
        };
        var getBlockStart = function (block) {
            return block.clone[0];
        };
        var getBlockEnd = function (block) {
            return block.clone[block.clone.length - 1];
        };
        return {
            restrict: 'A',
            multiElement: true,
            transclude: 'element',
            priority: 1000,
            terminal: true,
            $$tlb: true,
            compile: function ngRepeatCompile($element, $attr) {
                var ngRepeatN = parseInt($attr.ngRepeatN);
                var array = new Array(ngRepeatN);
                for (var i = 0; i < array.length; ++i) {
                    array[i] = i;
                }
                var expression = 'item in [' + array.toString() + ']';
                var ngRepeatEndComment = $compile.$$createComment('end ngRepeat', expression);
                var match = expression.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+as\s+([\s\S]+?))?(?:\s+track\s+by\s+([\s\S]+?))?\s*$/);
                if (!match) {
                    throw ngRepeatMinErr('iexp', "Expected expression in form of '_item_ in _collection_[ track by _id_]' but got '{0}'.", expression);
                }
                var lhs = match[1];
                var rhs = match[2];
                var aliasAs = match[3];
                var trackByExp = match[4];
                match = lhs.match(/^(?:(\s*[\$\w]+)|\(\s*([\$\w]+)\s*,\s*([\$\w]+)\s*\))$/);
                if (!match) {
                    throw ngRepeatMinErr('iidexp', "'_item_' in '_item_ in _collection_' should be an identifier or '(_key_, _value_)' expression, but got '{0}'.", lhs);
                }
                var valueIdentifier = match[3] || match[1];
                var keyIdentifier = match[2];
                if (aliasAs && (!/^[$a-zA-Z_][$a-zA-Z0-9_]*$/.test(aliasAs) ||
                    /^(null|undefined|this|\$index|\$first|\$middle|\$last|\$even|\$odd|\$parent|\$root|\$id)$/.test(aliasAs))) {
                    throw ngRepeatMinErr('badident', "alias '{0}' is invalid --- must be a valid JS identifier which is not a reserved name.", aliasAs);
                }
                var trackByExpGetter, trackByIdExpFn, trackByIdArrayFn, trackByIdObjFn;
                var hashFnLocals = { $id: hashKey_1.default };
                if (trackByExp) {
                    trackByExpGetter = $parse(trackByExp);
                }
                else {
                    trackByIdArrayFn = function (key, value) {
                        return hashKey_1.default(value);
                    };
                    trackByIdObjFn = function (key) {
                        return key;
                    };
                }
                return function ngRepeatLink($scope, $element, $attr, ctrl, $transclude) {
                    if (trackByExpGetter) {
                        trackByIdExpFn = function (key, value, index) {
                            // assign key, value, and $index to the locals so that they can be used in hash functions
                            if (keyIdentifier)
                                hashFnLocals[keyIdentifier] = key;
                            hashFnLocals[valueIdentifier] = value;
                            hashFnLocals.$index = index;
                            return trackByExpGetter($scope, hashFnLocals);
                        };
                    }
                    // Store a list of elements from previous run. This is a hash where key is the item from the
                    // iterator, and the value is objects with following properties.
                    //   - scope: bound scope
                    //   - element: previous element.
                    //   - index: position
                    //
                    // We are using no-proto object so that we don't need to guard against inherited props via
                    // hasOwnProperty.
                    var lastBlockMap = createMap_1.default();
                    //watch props
                    $scope.$watchCollection(rhs, function ngRepeatAction(collection) {
                        var index, length, previousNode = $element[0], // node that cloned nodes should be inserted after
                        // initialized to the comment node anchor
                        nextNode, 
                        // Same as lastBlockMap but it has the current state. It will become the
                        // lastBlockMap on the next iteration.
                        nextBlockMap = createMap_1.default(), collectionLength, key, value, // key/value of iteration
                        trackById, trackByIdFn, collectionKeys, block, // last object information {scope, element, id}
                        nextBlockOrder, elementsToRemove;
                        if (aliasAs) {
                            $scope[aliasAs] = collection;
                        }
                        if (isArrayLike(collection)) {
                            collectionKeys = collection;
                            trackByIdFn = trackByIdExpFn || trackByIdArrayFn;
                        }
                        else {
                            trackByIdFn = trackByIdExpFn || trackByIdObjFn;
                            // if object, extract keys, in enumeration order, unsorted
                            collectionKeys = [];
                            for (var itemKey in collection) {
                                if (hasOwnProperty.call(collection, itemKey) && itemKey.charAt(0) !== '$') {
                                    collectionKeys.push(itemKey);
                                }
                            }
                        }
                        collectionLength = collectionKeys.length;
                        nextBlockOrder = new Array(collectionLength);
                        // locate existing items
                        for (index = 0; index < collectionLength; index++) {
                            key = (collection === collectionKeys) ? index : collectionKeys[index];
                            value = collection[key];
                            trackById = trackByIdFn(key, value, index);
                            if (lastBlockMap[trackById]) {
                                // found previously seen block
                                block = lastBlockMap[trackById];
                                delete lastBlockMap[trackById];
                                nextBlockMap[trackById] = block;
                                nextBlockOrder[index] = block;
                            }
                            else if (nextBlockMap[trackById]) {
                                // if collision detected. restore lastBlockMap and throw an error
                                forEach(nextBlockOrder, function (block) {
                                    if (block && block.scope)
                                        lastBlockMap[block.id] = block;
                                });
                                throw ngRepeatMinErr('dupes', "Duplicates in a repeater are not allowed. Use 'track by' expression to specify unique keys. Repeater: {0}, Duplicate key: {1}, Duplicate value: {2}", expression, trackById, value);
                            }
                            else {
                                // new never before seen block
                                nextBlockOrder[index] = { id: trackById, scope: undefined, clone: undefined };
                                nextBlockMap[trackById] = true;
                            }
                        }
                        // remove leftover items
                        for (var blockKey in lastBlockMap) {
                            block = lastBlockMap[blockKey];
                            elementsToRemove = getBlockNodes(block.clone);
                            $animate.leave(elementsToRemove);
                            if (elementsToRemove[0].parentNode) {
                                // if the element was not removed yet because of pending animation, mark it as deleted
                                // so that we can ignore it later
                                for (index = 0, length = elementsToRemove.length; index < length; index++) {
                                    elementsToRemove[index][NG_REMOVED] = true;
                                }
                            }
                            block.scope.$destroy();
                        }
                        // we are not using forEach for perf reasons (trying to avoid #call)
                        for (index = 0; index < collectionLength; index++) {
                            key = (collection === collectionKeys) ? index : collectionKeys[index];
                            value = collection[key];
                            block = nextBlockOrder[index];
                            if (block.scope) {
                                // if we have already seen this object, then we need to reuse the
                                // associated scope/element
                                nextNode = previousNode;
                                // skip nodes that are already pending removal via leave animation
                                do {
                                    nextNode = nextNode.nextSibling;
                                } while (nextNode && nextNode[NG_REMOVED]);
                                if (getBlockStart(block) != nextNode) {
                                    // existing item which got moved
                                    $animate.move(getBlockNodes(block.clone), null, previousNode);
                                }
                                previousNode = getBlockEnd(block);
                                updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
                            }
                            else {
                                // new item which we don't know about
                                $transclude(function ngRepeatTransclude(clone, scope) {
                                    block.scope = scope;
                                    // http://jsperf.com/clone-vs-createcomment
                                    var endNode = ngRepeatEndComment.cloneNode(false);
                                    clone[clone.length++] = endNode;
                                    $animate.enter(clone, null, previousNode);
                                    previousNode = endNode;
                                    // Note: We only need the first/last node of the cloned nodes.
                                    // However, we need to keep the reference to the jqlite wrapper as it might be changed later
                                    // by a directive with templateUrl when its template arrives.
                                    block.clone = clone;
                                    nextBlockMap[block.id] = block;
                                    updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
                                });
                            }
                        }
                        lastBlockMap = nextBlockMap;
                    });
                };
            }
        };
    }]);

},{"./createMap":1,"./hashKey":2,"./minErr":4,"./utils":5}],4:[function(require,module,exports){
"use strict";
var utils_1 = require("./utils");
var isArrayLike = utils_1.default.isArrayLike;
var isUndefined = utils_1.default.isUndefined;
var isWindow = utils_1.default.isWindow;
var isScope = utils_1.default.isScope;
var isObject = utils_1.default.isObject;
function toJsonReplacer(key, value) {
    var val = value;
    if (typeof key === 'string' && key.charAt(0) === '$' && key.charAt(1) === '$') {
        val = undefined;
    }
    else if (isWindow(value)) {
        val = '$WINDOW';
    }
    else if (value && window.document === value) {
        val = '$DOCUMENT';
    }
    else if (isScope(value)) {
        val = '$SCOPE';
    }
    return val;
}
/* global toDebugString: true */
function serializeObject(obj) {
    var seen = [];
    return JSON.stringify(obj, function (key, val) {
        val = toJsonReplacer(key, val);
        if (isObject(val)) {
            if (seen.indexOf(val) >= 0)
                return '...';
            seen.push(val);
        }
        return val;
    });
}
function toDebugString(obj) {
    if (typeof obj === 'function') {
        return obj.toString().replace(/ \{[\s\S]*$/, '');
    }
    else if (isUndefined(obj)) {
        return 'undefined';
    }
    else if (typeof obj !== 'string') {
        return serializeObject(obj);
    }
    return obj;
}
function default_1(module, ErrorConstructor) {
    ErrorConstructor = ErrorConstructor || Error;
    return function () {
        var SKIP_INDEXES = 2;
        var templateArgs = arguments, code = templateArgs[0], message = '[' + (module ? module + ':' : '') + code + '] ', template = templateArgs[1], paramPrefix, i;
        message += template.replace(/\{\d+\}/g, function (match) {
            var index = +match.slice(1, -1), shiftedIndex = index + SKIP_INDEXES;
            if (shiftedIndex < templateArgs.length) {
                return toDebugString(templateArgs[shiftedIndex]);
            }
            return match;
        });
        message += '\nhttp://errors.angularjs.org/1.5.8/' +
            (module ? module + '/' : '') + code;
        for (i = SKIP_INDEXES, paramPrefix = '?'; i < templateArgs.length; i++, paramPrefix = '&') {
            message += paramPrefix + 'p' + (i - SKIP_INDEXES) + '=' +
                encodeURIComponent(toDebugString(templateArgs[i]));
        }
        return new ErrorConstructor(message);
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;

},{"./utils":5}],5:[function(require,module,exports){
/// <reference path="../typings/index.d.ts" />
"use strict";
function isArrayLike(obj) {
    // `null`, `undefined` and `window` are not array-like
    if (obj == null || isWindow(obj))
        return false;
    // arrays, strings and jQuery/jqLite objects are array like
    // * jqLite is either the jQuery or jqLite constructor function
    // * we have to check the existence of jqLite first as this method is called
    //   via the forEach method when constructing the jqLite object in the first place
    if (isArray(obj) || isString(obj))
        return true;
    // Support: iOS 8.2 (not reproducible in simulator)
    // "length" in obj used to prevent JIT error (gh-11508)
    var length = "length" in Object(obj) && obj.length;
    // NodeList objects (with `item` method) and
    // other objects with suitable length characteristics are array-like
    return isNumber(length) &&
        (length >= 0 && ((length - 1) in obj || obj instanceof Array) || typeof obj.item == 'function');
}
function isUndefined(value) { return typeof value === 'undefined'; }
function isWindow(obj) {
    return obj && obj.window === obj;
}
function isScope(obj) {
    return obj && obj.$evalAsync && obj.$watch;
}
var isArray = Array.isArray;
function isString(value) { return typeof value === 'string'; }
function isNumber(value) { return typeof value === 'number'; }
function isObject(value) { return value !== null && typeof value === 'object'; }
function isFunction(value) { return typeof value === 'function'; }
function isBlankObject(value) {
    return value !== null && typeof value === 'object' && !getPrototypeOf(value);
}
var getPrototypeOf = Object.getPrototypeOf;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var slice = [].slice;
function forEach(obj, iterator, context) {
    var key, length;
    if (obj) {
        if (isFunction(obj)) {
            for (key in obj) {
                // Need to check if hasOwnProperty exists,
                // as on IE8 the result of querySelectorAll is an object without a hasOwnProperty function
                if (key != 'prototype' && key != 'length' && key != 'name' && (!obj.hasOwnProperty || obj.hasOwnProperty(key))) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else if (isArray(obj) || isArrayLike(obj)) {
            var isPrimitive = typeof obj !== 'object';
            for (key = 0, length = obj.length; key < length; key++) {
                if (isPrimitive || key in obj) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else if (obj.forEach && obj.forEach !== forEach) {
            obj.forEach(iterator, context, obj);
        }
        else if (isBlankObject(obj)) {
            // createMap() fast path --- Safe to avoid hasOwnProperty check because prototype chain is empty
            for (key in obj) {
                iterator.call(context, obj[key], key, obj);
            }
        }
        else if (typeof obj.hasOwnProperty === 'function') {
            // Slow path for objects inheriting Object.prototype, hasOwnProperty check needed
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else {
            // Slow path for objects which do not have a method `hasOwnProperty`
            for (key in obj) {
                if (hasOwnProperty.call(obj, key)) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
    }
    return obj;
}
function getBlockNodes(nodes) {
    // TODO(perf): update `nodes` instead of creating a new object?
    var node = nodes[0];
    var endNode = nodes[nodes.length - 1];
    var blockNodes;
    for (var i = 1; node !== endNode && (node = node.nextSibling); i++) {
        if (blockNodes || nodes[i] !== node) {
            if (!blockNodes) {
                blockNodes = jqLite(slice.call(nodes, 0, i));
            }
            blockNodes.push(node);
        }
    }
    return blockNodes || nodes;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    isArrayLike: isArrayLike,
    isUndefined: isUndefined,
    isWindow: isWindow,
    isScope: isScope,
    isArray: isArray,
    isString: isString,
    isObject: isObject,
    isFuntion: isFunction,
    isBlankObject: isBlankObject,
    forEach: forEach,
    getBlockNodes: getBlockNodes
};

},{}],6:[function(require,module,exports){
/// <reference path="../typings/index.d.ts" />
"use strict";
require("ng-repeat-n");
angular.module("ng-rating-directive", ["ng-repeat-n-directive"])
    .directive('ngRating', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
        return {
            restrict: 'E',
            template: '<div><span ng-repeat-n="5" ng-click="changeRating($index)"><i class="fa fa-star" ng-show="($index + 1) <= bindRating"></i><i class="fa fa-star-half" ng-show="($index + 0.5) == bindRating"></i><i class="fa fa-star-o" ng-show="$index >= bindRating"></i></span></div>',
            link: function ($scope, $element, $attributes, controller) {
                $scope.$watch($attributes.ngModel, function () {
                    $scope.bindRating = $scope[$attributes.ngModel];
                });
                $scope.changeRating = function ($index) {
                    console.log($index);
                    if (($index + 1) != $scope.bindRating) {
                        $scope.bindRating = $index + 1;
                    }
                    else {
                        $scope.bindRating = $index + 0.5;
                    }
                    $scope[$attributes.ngModel] = $scope.bindRating;
                };
            }
        };
    }]);
},{"ng-repeat-n":3}],7:[function(require,module,exports){

},{}]},{},[6,7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbmctcmVwZWF0LW4vbGliL2NyZWF0ZU1hcC5qcyIsIm5vZGVfbW9kdWxlcy9uZy1yZXBlYXQtbi9saWIvaGFzaEtleS5qcyIsIm5vZGVfbW9kdWxlcy9uZy1yZXBlYXQtbi9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmctcmVwZWF0LW4vbGliL21pbkVyci5qcyIsIm5vZGVfbW9kdWxlcy9uZy1yZXBlYXQtbi9saWIvdXRpbHMuanMiLCJzcmMvaW5kZXgudHMiLCJ0eXBpbmdzL2Jyb3dzZXIuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25IQSw4Q0FBOEM7O0FBRTlDLFFBQU8sYUFBYSxDQUFDLENBQUE7QUFFckIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLHVCQUF1QixDQUFDLENBQUM7S0FDM0QsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRO1FBQzFGLE1BQU0sQ0FBQztZQUNILFFBQVEsRUFBRSxHQUFHO1lBQ2IsUUFBUSxFQUFFLDBRQUEwUTtZQUNwUixJQUFJLEVBQUUsVUFBVSxNQUFNLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxVQUFVO2dCQUNyRCxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUU7b0JBQy9CLE1BQU0sQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDcEQsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsTUFBTSxDQUFDLFlBQVksR0FBRyxVQUFVLE1BQU07b0JBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ3BCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUNwQyxNQUFNLENBQUMsVUFBVSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUM7b0JBQ25DLENBQUM7b0JBQ0QsSUFBSSxDQUFDLENBQUM7d0JBQ0YsTUFBTSxDQUFDLFVBQVUsR0FBRyxNQUFNLEdBQUcsR0FBRyxDQUFDO29CQUNyQyxDQUFDO29CQUNELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztnQkFDcEQsQ0FBQyxDQUFDO1lBQ04sQ0FBQztTQUNKLENBQUM7SUFDTixDQUFDLENBQUMsQ0FBQyxDQUFDOztBQzFCUiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcclxuZnVuY3Rpb24gY3JlYXRlTWFwKCkge1xyXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XHJcbn1cclxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xyXG5leHBvcnRzLmRlZmF1bHQgPSBjcmVhdGVNYXA7XHJcbiIsIlwidXNlIHN0cmljdFwiO1xyXG52YXIgdWlkID0gMDtcclxuZnVuY3Rpb24gbmV4dFVpZCgpIHtcclxuICAgIHJldHVybiArK3VpZDtcclxufVxyXG5mdW5jdGlvbiBoYXNoS2V5KG9iaiwgbmV4dFVpZEZuKSB7XHJcbiAgICB2YXIga2V5ID0gb2JqICYmIG9iai4kJGhhc2hLZXk7XHJcbiAgICBpZiAoa2V5KSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAga2V5ID0gb2JqLiQkaGFzaEtleSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4ga2V5O1xyXG4gICAgfVxyXG4gICAgdmFyIG9ialR5cGUgPSB0eXBlb2Ygb2JqO1xyXG4gICAgaWYgKG9ialR5cGUgPT0gJ2Z1bmN0aW9uJyB8fCAob2JqVHlwZSA9PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpKSB7XHJcbiAgICAgICAga2V5ID0gb2JqLiQkaGFzaEtleSA9IG9ialR5cGUgKyAnOicgKyAobmV4dFVpZEZuIHx8IG5leHRVaWQpKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICBrZXkgPSBvYmpUeXBlICsgJzonICsgb2JqO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGtleTtcclxufVxyXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XHJcbmV4cG9ydHMuZGVmYXVsdCA9IGhhc2hLZXk7XHJcbiIsIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL2luZGV4LmQudHNcIiAvPlxyXG5cInVzZSBzdHJpY3RcIjtcclxudmFyIG1pbkVycl8xID0gcmVxdWlyZShcIi4vbWluRXJyXCIpO1xyXG52YXIgaGFzaEtleV8xID0gcmVxdWlyZShcIi4vaGFzaEtleVwiKTtcclxudmFyIGNyZWF0ZU1hcF8xID0gcmVxdWlyZShcIi4vY3JlYXRlTWFwXCIpO1xyXG52YXIgdXRpbHNfMSA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xyXG52YXIgaXNBcnJheUxpa2UgPSB1dGlsc18xLmRlZmF1bHQuaXNBcnJheUxpa2U7XHJcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XHJcbnZhciBpc0FycmF5ID0gdXRpbHNfMS5kZWZhdWx0LmlzQXJyYXk7XHJcbnZhciBpc0Z1bmN0aW9uID0gdXRpbHNfMS5kZWZhdWx0LmlzRnVudGlvbjtcclxudmFyIGlzQmxhbmtPYmplY3QgPSB1dGlsc18xLmRlZmF1bHQuaXNCbGFua09iamVjdDtcclxudmFyIHNsaWNlID0gW10uc2xpY2U7XHJcbnZhciBmb3JFYWNoID0gdXRpbHNfMS5kZWZhdWx0LmZvckVhY2g7XHJcbnZhciBnZXRCbG9ja05vZGVzID0gdXRpbHNfMS5kZWZhdWx0LmdldEJsb2NrTm9kZXM7XHJcbmFuZ3VsYXIubW9kdWxlKCduZy1yZXBlYXQtbi1kaXJlY3RpdmUnLCBbXSlcclxuICAgIC5kaXJlY3RpdmUoJ25nUmVwZWF0TicsIFsnJHBhcnNlJywgJyRhbmltYXRlJywgJyRjb21waWxlJywgZnVuY3Rpb24gKCRwYXJzZSwgJGFuaW1hdGUsICRjb21waWxlKSB7XHJcbiAgICAgICAgdmFyIE5HX1JFTU9WRUQgPSAnJCROR19SRU1PVkVEJztcclxuICAgICAgICB2YXIgbmdSZXBlYXRNaW5FcnIgPSBtaW5FcnJfMS5kZWZhdWx0KCduZ1JlcGVhdCcpO1xyXG4gICAgICAgIHZhciB1cGRhdGVTY29wZSA9IGZ1bmN0aW9uIChzY29wZSwgaW5kZXgsIHZhbHVlSWRlbnRpZmllciwgdmFsdWUsIGtleUlkZW50aWZpZXIsIGtleSwgYXJyYXlMZW5ndGgpIHtcclxuICAgICAgICAgICAgLy8gVE9ETyhwZXJmKTogZ2VuZXJhdGUgc2V0dGVycyB0byBzaGF2ZSBvZmYgfjQwbXMgb3IgMS0xLjUlXHJcbiAgICAgICAgICAgIHNjb3BlW3ZhbHVlSWRlbnRpZmllcl0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgaWYgKGtleUlkZW50aWZpZXIpXHJcbiAgICAgICAgICAgICAgICBzY29wZVtrZXlJZGVudGlmaWVyXSA9IGtleTtcclxuICAgICAgICAgICAgc2NvcGUuJGluZGV4ID0gaW5kZXg7XHJcbiAgICAgICAgICAgIHNjb3BlLiRmaXJzdCA9IChpbmRleCA9PT0gMCk7XHJcbiAgICAgICAgICAgIHNjb3BlLiRsYXN0ID0gKGluZGV4ID09PSAoYXJyYXlMZW5ndGggLSAxKSk7XHJcbiAgICAgICAgICAgIHNjb3BlLiRtaWRkbGUgPSAhKHNjb3BlLiRmaXJzdCB8fCBzY29wZS4kbGFzdCk7XHJcbiAgICAgICAgICAgIC8vIGpzaGludCBiaXR3aXNlOiBmYWxzZVxyXG4gICAgICAgICAgICBzY29wZS4kb2RkID0gIShzY29wZS4kZXZlbiA9IChpbmRleCAmIDEpID09PSAwKTtcclxuICAgICAgICAgICAgLy8ganNoaW50IGJpdHdpc2U6IHRydWVcclxuICAgICAgICB9O1xyXG4gICAgICAgIHZhciBnZXRCbG9ja1N0YXJ0ID0gZnVuY3Rpb24gKGJsb2NrKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBibG9jay5jbG9uZVswXTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIHZhciBnZXRCbG9ja0VuZCA9IGZ1bmN0aW9uIChibG9jaykge1xyXG4gICAgICAgICAgICByZXR1cm4gYmxvY2suY2xvbmVbYmxvY2suY2xvbmUubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgfTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICByZXN0cmljdDogJ0EnLFxyXG4gICAgICAgICAgICBtdWx0aUVsZW1lbnQ6IHRydWUsXHJcbiAgICAgICAgICAgIHRyYW5zY2x1ZGU6ICdlbGVtZW50JyxcclxuICAgICAgICAgICAgcHJpb3JpdHk6IDEwMDAsXHJcbiAgICAgICAgICAgIHRlcm1pbmFsOiB0cnVlLFxyXG4gICAgICAgICAgICAkJHRsYjogdHJ1ZSxcclxuICAgICAgICAgICAgY29tcGlsZTogZnVuY3Rpb24gbmdSZXBlYXRDb21waWxlKCRlbGVtZW50LCAkYXR0cikge1xyXG4gICAgICAgICAgICAgICAgdmFyIG5nUmVwZWF0TiA9IHBhcnNlSW50KCRhdHRyLm5nUmVwZWF0Tik7XHJcbiAgICAgICAgICAgICAgICB2YXIgYXJyYXkgPSBuZXcgQXJyYXkobmdSZXBlYXROKTtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgICAgICBhcnJheVtpXSA9IGk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB2YXIgZXhwcmVzc2lvbiA9ICdpdGVtIGluIFsnICsgYXJyYXkudG9TdHJpbmcoKSArICddJztcclxuICAgICAgICAgICAgICAgIHZhciBuZ1JlcGVhdEVuZENvbW1lbnQgPSAkY29tcGlsZS4kJGNyZWF0ZUNvbW1lbnQoJ2VuZCBuZ1JlcGVhdCcsIGV4cHJlc3Npb24pO1xyXG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gZXhwcmVzc2lvbi5tYXRjaCgvXlxccyooW1xcc1xcU10rPylcXHMraW5cXHMrKFtcXHNcXFNdKz8pKD86XFxzK2FzXFxzKyhbXFxzXFxTXSs/KSk/KD86XFxzK3RyYWNrXFxzK2J5XFxzKyhbXFxzXFxTXSs/KSk/XFxzKiQvKTtcclxuICAgICAgICAgICAgICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignaWV4cCcsIFwiRXhwZWN0ZWQgZXhwcmVzc2lvbiBpbiBmb3JtIG9mICdfaXRlbV8gaW4gX2NvbGxlY3Rpb25fWyB0cmFjayBieSBfaWRfXScgYnV0IGdvdCAnezB9Jy5cIiwgZXhwcmVzc2lvbik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB2YXIgbGhzID0gbWF0Y2hbMV07XHJcbiAgICAgICAgICAgICAgICB2YXIgcmhzID0gbWF0Y2hbMl07XHJcbiAgICAgICAgICAgICAgICB2YXIgYWxpYXNBcyA9IG1hdGNoWzNdO1xyXG4gICAgICAgICAgICAgICAgdmFyIHRyYWNrQnlFeHAgPSBtYXRjaFs0XTtcclxuICAgICAgICAgICAgICAgIG1hdGNoID0gbGhzLm1hdGNoKC9eKD86KFxccypbXFwkXFx3XSspfFxcKFxccyooW1xcJFxcd10rKVxccyosXFxzKihbXFwkXFx3XSspXFxzKlxcKSkkLyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIW1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmdSZXBlYXRNaW5FcnIoJ2lpZGV4cCcsIFwiJ19pdGVtXycgaW4gJ19pdGVtXyBpbiBfY29sbGVjdGlvbl8nIHNob3VsZCBiZSBhbiBpZGVudGlmaWVyIG9yICcoX2tleV8sIF92YWx1ZV8pJyBleHByZXNzaW9uLCBidXQgZ290ICd7MH0nLlwiLCBsaHMpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdmFyIHZhbHVlSWRlbnRpZmllciA9IG1hdGNoWzNdIHx8IG1hdGNoWzFdO1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleUlkZW50aWZpZXIgPSBtYXRjaFsyXTtcclxuICAgICAgICAgICAgICAgIGlmIChhbGlhc0FzICYmICghL15bJGEtekEtWl9dWyRhLXpBLVowLTlfXSokLy50ZXN0KGFsaWFzQXMpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgL14obnVsbHx1bmRlZmluZWR8dGhpc3xcXCRpbmRleHxcXCRmaXJzdHxcXCRtaWRkbGV8XFwkbGFzdHxcXCRldmVufFxcJG9kZHxcXCRwYXJlbnR8XFwkcm9vdHxcXCRpZCkkLy50ZXN0KGFsaWFzQXMpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdiYWRpZGVudCcsIFwiYWxpYXMgJ3swfScgaXMgaW52YWxpZCAtLS0gbXVzdCBiZSBhIHZhbGlkIEpTIGlkZW50aWZpZXIgd2hpY2ggaXMgbm90IGEgcmVzZXJ2ZWQgbmFtZS5cIiwgYWxpYXNBcyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB2YXIgdHJhY2tCeUV4cEdldHRlciwgdHJhY2tCeUlkRXhwRm4sIHRyYWNrQnlJZEFycmF5Rm4sIHRyYWNrQnlJZE9iakZuO1xyXG4gICAgICAgICAgICAgICAgdmFyIGhhc2hGbkxvY2FscyA9IHsgJGlkOiBoYXNoS2V5XzEuZGVmYXVsdCB9O1xyXG4gICAgICAgICAgICAgICAgaWYgKHRyYWNrQnlFeHApIHtcclxuICAgICAgICAgICAgICAgICAgICB0cmFja0J5RXhwR2V0dGVyID0gJHBhcnNlKHRyYWNrQnlFeHApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJhY2tCeUlkQXJyYXlGbiA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoYXNoS2V5XzEuZGVmYXVsdCh2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICB0cmFja0J5SWRPYmpGbiA9IGZ1bmN0aW9uIChrZXkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5nUmVwZWF0TGluaygkc2NvcGUsICRlbGVtZW50LCAkYXR0ciwgY3RybCwgJHRyYW5zY2x1ZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHJhY2tCeUV4cEdldHRlcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFja0J5SWRFeHBGbiA9IGZ1bmN0aW9uIChrZXksIHZhbHVlLCBpbmRleCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXNzaWduIGtleSwgdmFsdWUsIGFuZCAkaW5kZXggdG8gdGhlIGxvY2FscyBzbyB0aGF0IHRoZXkgY2FuIGJlIHVzZWQgaW4gaGFzaCBmdW5jdGlvbnNcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChrZXlJZGVudGlmaWVyKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc2hGbkxvY2Fsc1trZXlJZGVudGlmaWVyXSA9IGtleTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc2hGbkxvY2Fsc1t2YWx1ZUlkZW50aWZpZXJdID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNoRm5Mb2NhbHMuJGluZGV4ID0gaW5kZXg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJhY2tCeUV4cEdldHRlcigkc2NvcGUsIGhhc2hGbkxvY2Fscyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFN0b3JlIGEgbGlzdCBvZiBlbGVtZW50cyBmcm9tIHByZXZpb3VzIHJ1bi4gVGhpcyBpcyBhIGhhc2ggd2hlcmUga2V5IGlzIHRoZSBpdGVtIGZyb20gdGhlXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gaXRlcmF0b3IsIGFuZCB0aGUgdmFsdWUgaXMgb2JqZWN0cyB3aXRoIGZvbGxvd2luZyBwcm9wZXJ0aWVzLlxyXG4gICAgICAgICAgICAgICAgICAgIC8vICAgLSBzY29wZTogYm91bmQgc2NvcGVcclxuICAgICAgICAgICAgICAgICAgICAvLyAgIC0gZWxlbWVudDogcHJldmlvdXMgZWxlbWVudC5cclxuICAgICAgICAgICAgICAgICAgICAvLyAgIC0gaW5kZXg6IHBvc2l0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgLy9cclxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBhcmUgdXNpbmcgbm8tcHJvdG8gb2JqZWN0IHNvIHRoYXQgd2UgZG9uJ3QgbmVlZCB0byBndWFyZCBhZ2FpbnN0IGluaGVyaXRlZCBwcm9wcyB2aWFcclxuICAgICAgICAgICAgICAgICAgICAvLyBoYXNPd25Qcm9wZXJ0eS5cclxuICAgICAgICAgICAgICAgICAgICB2YXIgbGFzdEJsb2NrTWFwID0gY3JlYXRlTWFwXzEuZGVmYXVsdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vd2F0Y2ggcHJvcHNcclxuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuJHdhdGNoQ29sbGVjdGlvbihyaHMsIGZ1bmN0aW9uIG5nUmVwZWF0QWN0aW9uKGNvbGxlY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGluZGV4LCBsZW5ndGgsIHByZXZpb3VzTm9kZSA9ICRlbGVtZW50WzBdLCAvLyBub2RlIHRoYXQgY2xvbmVkIG5vZGVzIHNob3VsZCBiZSBpbnNlcnRlZCBhZnRlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCB0byB0aGUgY29tbWVudCBub2RlIGFuY2hvclxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXh0Tm9kZSwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNhbWUgYXMgbGFzdEJsb2NrTWFwIGJ1dCBpdCBoYXMgdGhlIGN1cnJlbnQgc3RhdGUuIEl0IHdpbGwgYmVjb21lIHRoZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBsYXN0QmxvY2tNYXAgb24gdGhlIG5leHQgaXRlcmF0aW9uLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXh0QmxvY2tNYXAgPSBjcmVhdGVNYXBfMS5kZWZhdWx0KCksIGNvbGxlY3Rpb25MZW5ndGgsIGtleSwgdmFsdWUsIC8vIGtleS92YWx1ZSBvZiBpdGVyYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhY2tCeUlkLCB0cmFja0J5SWRGbiwgY29sbGVjdGlvbktleXMsIGJsb2NrLCAvLyBsYXN0IG9iamVjdCBpbmZvcm1hdGlvbiB7c2NvcGUsIGVsZW1lbnQsIGlkfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXh0QmxvY2tPcmRlciwgZWxlbWVudHNUb1JlbW92ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFsaWFzQXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZVthbGlhc0FzXSA9IGNvbGxlY3Rpb247XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzQXJyYXlMaWtlKGNvbGxlY3Rpb24pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cyA9IGNvbGxlY3Rpb247XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cmFja0J5SWRGbiA9IHRyYWNrQnlJZEV4cEZuIHx8IHRyYWNrQnlJZEFycmF5Rm47XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cmFja0J5SWRGbiA9IHRyYWNrQnlJZEV4cEZuIHx8IHRyYWNrQnlJZE9iakZuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgb2JqZWN0LCBleHRyYWN0IGtleXMsIGluIGVudW1lcmF0aW9uIG9yZGVyLCB1bnNvcnRlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMgPSBbXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGl0ZW1LZXkgaW4gY29sbGVjdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGNvbGxlY3Rpb24sIGl0ZW1LZXkpICYmIGl0ZW1LZXkuY2hhckF0KDApICE9PSAnJCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMucHVzaChpdGVtS2V5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbkxlbmd0aCA9IGNvbGxlY3Rpb25LZXlzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXIgPSBuZXcgQXJyYXkoY29sbGVjdGlvbkxlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxvY2F0ZSBleGlzdGluZyBpdGVtc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGluZGV4ID0gMDsgaW5kZXggPCBjb2xsZWN0aW9uTGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSAoY29sbGVjdGlvbiA9PT0gY29sbGVjdGlvbktleXMpID8gaW5kZXggOiBjb2xsZWN0aW9uS2V5c1tpbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IGNvbGxlY3Rpb25ba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrQnlJZCA9IHRyYWNrQnlJZEZuKGtleSwgdmFsdWUsIGluZGV4KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXN0QmxvY2tNYXBbdHJhY2tCeUlkXSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZvdW5kIHByZXZpb3VzbHkgc2VlbiBibG9ja1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrID0gbGFzdEJsb2NrTWFwW3RyYWNrQnlJZF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGxhc3RCbG9ja01hcFt0cmFja0J5SWRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5leHRCbG9ja01hcFt0cmFja0J5SWRdID0gYmxvY2s7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXJbaW5kZXhdID0gYmxvY2s7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChuZXh0QmxvY2tNYXBbdHJhY2tCeUlkXSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGNvbGxpc2lvbiBkZXRlY3RlZC4gcmVzdG9yZSBsYXN0QmxvY2tNYXAgYW5kIHRocm93IGFuIGVycm9yXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yRWFjaChuZXh0QmxvY2tPcmRlciwgZnVuY3Rpb24gKGJsb2NrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChibG9jayAmJiBibG9jay5zY29wZSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RCbG9ja01hcFtibG9jay5pZF0gPSBibG9jaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignZHVwZXMnLCBcIkR1cGxpY2F0ZXMgaW4gYSByZXBlYXRlciBhcmUgbm90IGFsbG93ZWQuIFVzZSAndHJhY2sgYnknIGV4cHJlc3Npb24gdG8gc3BlY2lmeSB1bmlxdWUga2V5cy4gUmVwZWF0ZXI6IHswfSwgRHVwbGljYXRlIGtleTogezF9LCBEdXBsaWNhdGUgdmFsdWU6IHsyfVwiLCBleHByZXNzaW9uLCB0cmFja0J5SWQsIHZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldyBuZXZlciBiZWZvcmUgc2VlbiBibG9ja1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5leHRCbG9ja09yZGVyW2luZGV4XSA9IHsgaWQ6IHRyYWNrQnlJZCwgc2NvcGU6IHVuZGVmaW5lZCwgY2xvbmU6IHVuZGVmaW5lZCB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5leHRCbG9ja01hcFt0cmFja0J5SWRdID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgbGVmdG92ZXIgaXRlbXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgYmxvY2tLZXkgaW4gbGFzdEJsb2NrTWFwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBibG9jayA9IGxhc3RCbG9ja01hcFtibG9ja0tleV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1RvUmVtb3ZlID0gZ2V0QmxvY2tOb2RlcyhibG9jay5jbG9uZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkYW5pbWF0ZS5sZWF2ZShlbGVtZW50c1RvUmVtb3ZlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbGVtZW50c1RvUmVtb3ZlWzBdLnBhcmVudE5vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgZWxlbWVudCB3YXMgbm90IHJlbW92ZWQgeWV0IGJlY2F1c2Ugb2YgcGVuZGluZyBhbmltYXRpb24sIG1hcmsgaXQgYXMgZGVsZXRlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNvIHRoYXQgd2UgY2FuIGlnbm9yZSBpdCBsYXRlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaW5kZXggPSAwLCBsZW5ndGggPSBlbGVtZW50c1RvUmVtb3ZlLmxlbmd0aDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHNUb1JlbW92ZVtpbmRleF1bTkdfUkVNT1ZFRF0gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrLnNjb3BlLiRkZXN0cm95KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXJlIG5vdCB1c2luZyBmb3JFYWNoIGZvciBwZXJmIHJlYXNvbnMgKHRyeWluZyB0byBhdm9pZCAjY2FsbClcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpbmRleCA9IDA7IGluZGV4IDwgY29sbGVjdGlvbkxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gKGNvbGxlY3Rpb24gPT09IGNvbGxlY3Rpb25LZXlzKSA/IGluZGV4IDogY29sbGVjdGlvbktleXNbaW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBjb2xsZWN0aW9uW2tleV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBibG9jayA9IG5leHRCbG9ja09yZGVyW2luZGV4XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChibG9jay5zY29wZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgYWxyZWFkeSBzZWVuIHRoaXMgb2JqZWN0LCB0aGVuIHdlIG5lZWQgdG8gcmV1c2UgdGhlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXNzb2NpYXRlZCBzY29wZS9lbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dE5vZGUgPSBwcmV2aW91c05vZGU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2tpcCBub2RlcyB0aGF0IGFyZSBhbHJlYWR5IHBlbmRpbmcgcmVtb3ZhbCB2aWEgbGVhdmUgYW5pbWF0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0Tm9kZSA9IG5leHROb2RlLm5leHRTaWJsaW5nO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gd2hpbGUgKG5leHROb2RlICYmIG5leHROb2RlW05HX1JFTU9WRURdKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZ2V0QmxvY2tTdGFydChibG9jaykgIT0gbmV4dE5vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZXhpc3RpbmcgaXRlbSB3aGljaCBnb3QgbW92ZWRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJGFuaW1hdGUubW92ZShnZXRCbG9ja05vZGVzKGJsb2NrLmNsb25lKSwgbnVsbCwgcHJldmlvdXNOb2RlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gZ2V0QmxvY2tFbmQoYmxvY2spO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVNjb3BlKGJsb2NrLnNjb3BlLCBpbmRleCwgdmFsdWVJZGVudGlmaWVyLCB2YWx1ZSwga2V5SWRlbnRpZmllciwga2V5LCBjb2xsZWN0aW9uTGVuZ3RoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldyBpdGVtIHdoaWNoIHdlIGRvbid0IGtub3cgYWJvdXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkdHJhbnNjbHVkZShmdW5jdGlvbiBuZ1JlcGVhdFRyYW5zY2x1ZGUoY2xvbmUsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrLnNjb3BlID0gc2NvcGU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGh0dHA6Ly9qc3BlcmYuY29tL2Nsb25lLXZzLWNyZWF0ZWNvbW1lbnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVuZE5vZGUgPSBuZ1JlcGVhdEVuZENvbW1lbnQuY2xvbmVOb2RlKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVbY2xvbmUubGVuZ3RoKytdID0gZW5kTm9kZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJGFuaW1hdGUuZW50ZXIoY2xvbmUsIG51bGwsIHByZXZpb3VzTm9kZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZSA9IGVuZE5vZGU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vdGU6IFdlIG9ubHkgbmVlZCB0aGUgZmlyc3QvbGFzdCBub2RlIG9mIHRoZSBjbG9uZWQgbm9kZXMuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEhvd2V2ZXIsIHdlIG5lZWQgdG8ga2VlcCB0aGUgcmVmZXJlbmNlIHRvIHRoZSBqcWxpdGUgd3JhcHBlciBhcyBpdCBtaWdodCBiZSBjaGFuZ2VkIGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJ5IGEgZGlyZWN0aXZlIHdpdGggdGVtcGxhdGVVcmwgd2hlbiBpdHMgdGVtcGxhdGUgYXJyaXZlcy5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2suY2xvbmUgPSBjbG9uZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW2Jsb2NrLmlkXSA9IGJsb2NrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVTY29wZShibG9jay5zY29wZSwgaW5kZXgsIHZhbHVlSWRlbnRpZmllciwgdmFsdWUsIGtleUlkZW50aWZpZXIsIGtleSwgY29sbGVjdGlvbkxlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGFzdEJsb2NrTWFwID0gbmV4dEJsb2NrTWFwO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XSk7XHJcbiIsIlwidXNlIHN0cmljdFwiO1xyXG52YXIgdXRpbHNfMSA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xyXG52YXIgaXNBcnJheUxpa2UgPSB1dGlsc18xLmRlZmF1bHQuaXNBcnJheUxpa2U7XHJcbnZhciBpc1VuZGVmaW5lZCA9IHV0aWxzXzEuZGVmYXVsdC5pc1VuZGVmaW5lZDtcclxudmFyIGlzV2luZG93ID0gdXRpbHNfMS5kZWZhdWx0LmlzV2luZG93O1xyXG52YXIgaXNTY29wZSA9IHV0aWxzXzEuZGVmYXVsdC5pc1Njb3BlO1xyXG52YXIgaXNPYmplY3QgPSB1dGlsc18xLmRlZmF1bHQuaXNPYmplY3Q7XHJcbmZ1bmN0aW9uIHRvSnNvblJlcGxhY2VyKGtleSwgdmFsdWUpIHtcclxuICAgIHZhciB2YWwgPSB2YWx1ZTtcclxuICAgIGlmICh0eXBlb2Yga2V5ID09PSAnc3RyaW5nJyAmJiBrZXkuY2hhckF0KDApID09PSAnJCcgJiYga2V5LmNoYXJBdCgxKSA9PT0gJyQnKSB7XHJcbiAgICAgICAgdmFsID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAoaXNXaW5kb3codmFsdWUpKSB7XHJcbiAgICAgICAgdmFsID0gJyRXSU5ET1cnO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodmFsdWUgJiYgd2luZG93LmRvY3VtZW50ID09PSB2YWx1ZSkge1xyXG4gICAgICAgIHZhbCA9ICckRE9DVU1FTlQnO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAoaXNTY29wZSh2YWx1ZSkpIHtcclxuICAgICAgICB2YWwgPSAnJFNDT1BFJztcclxuICAgIH1cclxuICAgIHJldHVybiB2YWw7XHJcbn1cclxuLyogZ2xvYmFsIHRvRGVidWdTdHJpbmc6IHRydWUgKi9cclxuZnVuY3Rpb24gc2VyaWFsaXplT2JqZWN0KG9iaikge1xyXG4gICAgdmFyIHNlZW4gPSBbXTtcclxuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIGZ1bmN0aW9uIChrZXksIHZhbCkge1xyXG4gICAgICAgIHZhbCA9IHRvSnNvblJlcGxhY2VyKGtleSwgdmFsKTtcclxuICAgICAgICBpZiAoaXNPYmplY3QodmFsKSkge1xyXG4gICAgICAgICAgICBpZiAoc2Vlbi5pbmRleE9mKHZhbCkgPj0gMClcclxuICAgICAgICAgICAgICAgIHJldHVybiAnLi4uJztcclxuICAgICAgICAgICAgc2Vlbi5wdXNoKHZhbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB2YWw7XHJcbiAgICB9KTtcclxufVxyXG5mdW5jdGlvbiB0b0RlYnVnU3RyaW5nKG9iaikge1xyXG4gICAgaWYgKHR5cGVvZiBvYmogPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByZXR1cm4gb2JqLnRvU3RyaW5nKCkucmVwbGFjZSgvIFxce1tcXHNcXFNdKiQvLCAnJyk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChpc1VuZGVmaW5lZChvYmopKSB7XHJcbiAgICAgICAgcmV0dXJuICd1bmRlZmluZWQnO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgICByZXR1cm4gc2VyaWFsaXplT2JqZWN0KG9iaik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gb2JqO1xyXG59XHJcbmZ1bmN0aW9uIGRlZmF1bHRfMShtb2R1bGUsIEVycm9yQ29uc3RydWN0b3IpIHtcclxuICAgIEVycm9yQ29uc3RydWN0b3IgPSBFcnJvckNvbnN0cnVjdG9yIHx8IEVycm9yO1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB2YXIgU0tJUF9JTkRFWEVTID0gMjtcclxuICAgICAgICB2YXIgdGVtcGxhdGVBcmdzID0gYXJndW1lbnRzLCBjb2RlID0gdGVtcGxhdGVBcmdzWzBdLCBtZXNzYWdlID0gJ1snICsgKG1vZHVsZSA/IG1vZHVsZSArICc6JyA6ICcnKSArIGNvZGUgKyAnXSAnLCB0ZW1wbGF0ZSA9IHRlbXBsYXRlQXJnc1sxXSwgcGFyYW1QcmVmaXgsIGk7XHJcbiAgICAgICAgbWVzc2FnZSArPSB0ZW1wbGF0ZS5yZXBsYWNlKC9cXHtcXGQrXFx9L2csIGZ1bmN0aW9uIChtYXRjaCkge1xyXG4gICAgICAgICAgICB2YXIgaW5kZXggPSArbWF0Y2guc2xpY2UoMSwgLTEpLCBzaGlmdGVkSW5kZXggPSBpbmRleCArIFNLSVBfSU5ERVhFUztcclxuICAgICAgICAgICAgaWYgKHNoaWZ0ZWRJbmRleCA8IHRlbXBsYXRlQXJncy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0b0RlYnVnU3RyaW5nKHRlbXBsYXRlQXJnc1tzaGlmdGVkSW5kZXhdKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgbWVzc2FnZSArPSAnXFxuaHR0cDovL2Vycm9ycy5hbmd1bGFyanMub3JnLzEuNS44LycgK1xyXG4gICAgICAgICAgICAobW9kdWxlID8gbW9kdWxlICsgJy8nIDogJycpICsgY29kZTtcclxuICAgICAgICBmb3IgKGkgPSBTS0lQX0lOREVYRVMsIHBhcmFtUHJlZml4ID0gJz8nOyBpIDwgdGVtcGxhdGVBcmdzLmxlbmd0aDsgaSsrLCBwYXJhbVByZWZpeCA9ICcmJykge1xyXG4gICAgICAgICAgICBtZXNzYWdlICs9IHBhcmFtUHJlZml4ICsgJ3AnICsgKGkgLSBTS0lQX0lOREVYRVMpICsgJz0nICtcclxuICAgICAgICAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudCh0b0RlYnVnU3RyaW5nKHRlbXBsYXRlQXJnc1tpXSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3IEVycm9yQ29uc3RydWN0b3IobWVzc2FnZSk7XHJcbiAgICB9O1xyXG59XHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcclxuZXhwb3J0cy5kZWZhdWx0ID0gZGVmYXVsdF8xO1xyXG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vdHlwaW5ncy9pbmRleC5kLnRzXCIgLz5cclxuXCJ1c2Ugc3RyaWN0XCI7XHJcbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKG9iaikge1xyXG4gICAgLy8gYG51bGxgLCBgdW5kZWZpbmVkYCBhbmQgYHdpbmRvd2AgYXJlIG5vdCBhcnJheS1saWtlXHJcbiAgICBpZiAob2JqID09IG51bGwgfHwgaXNXaW5kb3cob2JqKSlcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAvLyBhcnJheXMsIHN0cmluZ3MgYW5kIGpRdWVyeS9qcUxpdGUgb2JqZWN0cyBhcmUgYXJyYXkgbGlrZVxyXG4gICAgLy8gKiBqcUxpdGUgaXMgZWl0aGVyIHRoZSBqUXVlcnkgb3IganFMaXRlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uXHJcbiAgICAvLyAqIHdlIGhhdmUgdG8gY2hlY2sgdGhlIGV4aXN0ZW5jZSBvZiBqcUxpdGUgZmlyc3QgYXMgdGhpcyBtZXRob2QgaXMgY2FsbGVkXHJcbiAgICAvLyAgIHZpYSB0aGUgZm9yRWFjaCBtZXRob2Qgd2hlbiBjb25zdHJ1Y3RpbmcgdGhlIGpxTGl0ZSBvYmplY3QgaW4gdGhlIGZpcnN0IHBsYWNlXHJcbiAgICBpZiAoaXNBcnJheShvYmopIHx8IGlzU3RyaW5nKG9iaikpXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAvLyBTdXBwb3J0OiBpT1MgOC4yIChub3QgcmVwcm9kdWNpYmxlIGluIHNpbXVsYXRvcilcclxuICAgIC8vIFwibGVuZ3RoXCIgaW4gb2JqIHVzZWQgdG8gcHJldmVudCBKSVQgZXJyb3IgKGdoLTExNTA4KVxyXG4gICAgdmFyIGxlbmd0aCA9IFwibGVuZ3RoXCIgaW4gT2JqZWN0KG9iaikgJiYgb2JqLmxlbmd0aDtcclxuICAgIC8vIE5vZGVMaXN0IG9iamVjdHMgKHdpdGggYGl0ZW1gIG1ldGhvZCkgYW5kXHJcbiAgICAvLyBvdGhlciBvYmplY3RzIHdpdGggc3VpdGFibGUgbGVuZ3RoIGNoYXJhY3RlcmlzdGljcyBhcmUgYXJyYXktbGlrZVxyXG4gICAgcmV0dXJuIGlzTnVtYmVyKGxlbmd0aCkgJiZcclxuICAgICAgICAobGVuZ3RoID49IDAgJiYgKChsZW5ndGggLSAxKSBpbiBvYmogfHwgb2JqIGluc3RhbmNlb2YgQXJyYXkpIHx8IHR5cGVvZiBvYmouaXRlbSA9PSAnZnVuY3Rpb24nKTtcclxufVxyXG5mdW5jdGlvbiBpc1VuZGVmaW5lZCh2YWx1ZSkgeyByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJzsgfVxyXG5mdW5jdGlvbiBpc1dpbmRvdyhvYmopIHtcclxuICAgIHJldHVybiBvYmogJiYgb2JqLndpbmRvdyA9PT0gb2JqO1xyXG59XHJcbmZ1bmN0aW9uIGlzU2NvcGUob2JqKSB7XHJcbiAgICByZXR1cm4gb2JqICYmIG9iai4kZXZhbEFzeW5jICYmIG9iai4kd2F0Y2g7XHJcbn1cclxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xyXG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkgeyByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJzsgfVxyXG5mdW5jdGlvbiBpc051bWJlcih2YWx1ZSkgeyByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJzsgfVxyXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkgeyByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JzsgfVxyXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHZhbHVlKSB7IHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbic7IH1cclxuZnVuY3Rpb24gaXNCbGFua09iamVjdCh2YWx1ZSkge1xyXG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIWdldFByb3RvdHlwZU9mKHZhbHVlKTtcclxufVxyXG52YXIgZ2V0UHJvdG90eXBlT2YgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2Y7XHJcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XHJcbnZhciBzbGljZSA9IFtdLnNsaWNlO1xyXG5mdW5jdGlvbiBmb3JFYWNoKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcclxuICAgIHZhciBrZXksIGxlbmd0aDtcclxuICAgIGlmIChvYmopIHtcclxuICAgICAgICBpZiAoaXNGdW5jdGlvbihvYmopKSB7XHJcbiAgICAgICAgICAgIGZvciAoa2V5IGluIG9iaikge1xyXG4gICAgICAgICAgICAgICAgLy8gTmVlZCB0byBjaGVjayBpZiBoYXNPd25Qcm9wZXJ0eSBleGlzdHMsXHJcbiAgICAgICAgICAgICAgICAvLyBhcyBvbiBJRTggdGhlIHJlc3VsdCBvZiBxdWVyeVNlbGVjdG9yQWxsIGlzIGFuIG9iamVjdCB3aXRob3V0IGEgaGFzT3duUHJvcGVydHkgZnVuY3Rpb25cclxuICAgICAgICAgICAgICAgIGlmIChrZXkgIT0gJ3Byb3RvdHlwZScgJiYga2V5ICE9ICdsZW5ndGgnICYmIGtleSAhPSAnbmFtZScgJiYgKCFvYmouaGFzT3duUHJvcGVydHkgfHwgb2JqLmhhc093blByb3BlcnR5KGtleSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGlzQXJyYXkob2JqKSB8fCBpc0FycmF5TGlrZShvYmopKSB7XHJcbiAgICAgICAgICAgIHZhciBpc1ByaW1pdGl2ZSA9IHR5cGVvZiBvYmogIT09ICdvYmplY3QnO1xyXG4gICAgICAgICAgICBmb3IgKGtleSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGtleSA8IGxlbmd0aDsga2V5KyspIHtcclxuICAgICAgICAgICAgICAgIGlmIChpc1ByaW1pdGl2ZSB8fCBrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKG9iai5mb3JFYWNoICYmIG9iai5mb3JFYWNoICE9PSBmb3JFYWNoKSB7XHJcbiAgICAgICAgICAgIG9iai5mb3JFYWNoKGl0ZXJhdG9yLCBjb250ZXh0LCBvYmopO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChpc0JsYW5rT2JqZWN0KG9iaikpIHtcclxuICAgICAgICAgICAgLy8gY3JlYXRlTWFwKCkgZmFzdCBwYXRoIC0tLSBTYWZlIHRvIGF2b2lkIGhhc093blByb3BlcnR5IGNoZWNrIGJlY2F1c2UgcHJvdG90eXBlIGNoYWluIGlzIGVtcHR5XHJcbiAgICAgICAgICAgIGZvciAoa2V5IGluIG9iaikge1xyXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBvYmouaGFzT3duUHJvcGVydHkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgLy8gU2xvdyBwYXRoIGZvciBvYmplY3RzIGluaGVyaXRpbmcgT2JqZWN0LnByb3RvdHlwZSwgaGFzT3duUHJvcGVydHkgY2hlY2sgbmVlZGVkXHJcbiAgICAgICAgICAgIGZvciAoa2V5IGluIG9iaikge1xyXG4gICAgICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBTbG93IHBhdGggZm9yIG9iamVjdHMgd2hpY2ggZG8gbm90IGhhdmUgYSBtZXRob2QgYGhhc093blByb3BlcnR5YFxyXG4gICAgICAgICAgICBmb3IgKGtleSBpbiBvYmopIHtcclxuICAgICAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2tleV0sIGtleSwgb2JqKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBvYmo7XHJcbn1cclxuZnVuY3Rpb24gZ2V0QmxvY2tOb2Rlcyhub2Rlcykge1xyXG4gICAgLy8gVE9ETyhwZXJmKTogdXBkYXRlIGBub2Rlc2AgaW5zdGVhZCBvZiBjcmVhdGluZyBhIG5ldyBvYmplY3Q/XHJcbiAgICB2YXIgbm9kZSA9IG5vZGVzWzBdO1xyXG4gICAgdmFyIGVuZE5vZGUgPSBub2Rlc1tub2Rlcy5sZW5ndGggLSAxXTtcclxuICAgIHZhciBibG9ja05vZGVzO1xyXG4gICAgZm9yICh2YXIgaSA9IDE7IG5vZGUgIT09IGVuZE5vZGUgJiYgKG5vZGUgPSBub2RlLm5leHRTaWJsaW5nKTsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGJsb2NrTm9kZXMgfHwgbm9kZXNbaV0gIT09IG5vZGUpIHtcclxuICAgICAgICAgICAgaWYgKCFibG9ja05vZGVzKSB7XHJcbiAgICAgICAgICAgICAgICBibG9ja05vZGVzID0ganFMaXRlKHNsaWNlLmNhbGwobm9kZXMsIDAsIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBibG9ja05vZGVzLnB1c2gobm9kZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJsb2NrTm9kZXMgfHwgbm9kZXM7XHJcbn1cclxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xyXG5leHBvcnRzLmRlZmF1bHQgPSB7XHJcbiAgICBpc0FycmF5TGlrZTogaXNBcnJheUxpa2UsXHJcbiAgICBpc1VuZGVmaW5lZDogaXNVbmRlZmluZWQsXHJcbiAgICBpc1dpbmRvdzogaXNXaW5kb3csXHJcbiAgICBpc1Njb3BlOiBpc1Njb3BlLFxyXG4gICAgaXNBcnJheTogaXNBcnJheSxcclxuICAgIGlzU3RyaW5nOiBpc1N0cmluZyxcclxuICAgIGlzT2JqZWN0OiBpc09iamVjdCxcclxuICAgIGlzRnVudGlvbjogaXNGdW5jdGlvbixcclxuICAgIGlzQmxhbmtPYmplY3Q6IGlzQmxhbmtPYmplY3QsXHJcbiAgICBmb3JFYWNoOiBmb3JFYWNoLFxyXG4gICAgZ2V0QmxvY2tOb2RlczogZ2V0QmxvY2tOb2Rlc1xyXG59O1xyXG4iLCIvLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vdHlwaW5ncy9pbmRleC5kLnRzXCIgLz5cblxuaW1wb3J0IFwibmctcmVwZWF0LW5cIjtcblxuYW5ndWxhci5tb2R1bGUoXCJuZy1yYXRpbmctZGlyZWN0aXZlXCIsIFtcIm5nLXJlcGVhdC1uLWRpcmVjdGl2ZVwiXSlcbiAgICAuZGlyZWN0aXZlKCduZ1JhdGluZycsIFsnJHBhcnNlJywgJyRhbmltYXRlJywgJyRjb21waWxlJywgZnVuY3Rpb24gKCRwYXJzZSwgJGFuaW1hdGUsICRjb21waWxlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICAgICAgdGVtcGxhdGU6ICc8ZGl2PjxzcGFuIG5nLXJlcGVhdC1uPVwiNVwiIG5nLWNsaWNrPVwiY2hhbmdlUmF0aW5nKCRpbmRleClcIj48aSBjbGFzcz1cImZhIGZhLXN0YXJcIiBuZy1zaG93PVwiKCRpbmRleCArIDEpIDw9IGJpbmRSYXRpbmdcIj48L2k+PGkgY2xhc3M9XCJmYSBmYS1zdGFyLWhhbGZcIiBuZy1zaG93PVwiKCRpbmRleCArIDAuNSkgPT0gYmluZFJhdGluZ1wiPjwvaT48aSBjbGFzcz1cImZhIGZhLXN0YXItb1wiIG5nLXNob3c9XCIkaW5kZXggPj0gYmluZFJhdGluZ1wiPjwvaT48L3NwYW4+PC9kaXY+JyxcbiAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uICgkc2NvcGUsICRlbGVtZW50LCAkYXR0cmlidXRlcywgY29udHJvbGxlcikge1xuICAgICAgICAgICAgICAgICRzY29wZS4kd2F0Y2goJGF0dHJpYnV0ZXMubmdNb2RlbCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuYmluZFJhdGluZyA9ICRzY29wZVskYXR0cmlidXRlcy5uZ01vZGVsXTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICRzY29wZS5jaGFuZ2VSYXRpbmcgPSBmdW5jdGlvbiAoJGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCRpbmRleCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoJGluZGV4ICsgMSkgIT0gJHNjb3BlLmJpbmRSYXRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5iaW5kUmF0aW5nID0gJGluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5iaW5kUmF0aW5nID0gJGluZGV4ICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICRzY29wZVskYXR0cmlidXRlcy5uZ01vZGVsXSA9ICRzY29wZS5iaW5kUmF0aW5nO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfV0pO1xuIiwiIl19
